import crypto from 'crypto';
import type { Request, Response } from 'express';
import { AUTH, COOKIE_NAME, getCookieOptions, isStaffRole } from '../config/auth';
import { generateRefreshToken, hashSecret } from '../helpers/tokens';
import { RefreshSessionModel } from '../models/RefreshSession';
import { UserModel } from '../models/User';

type SessionUser = {
    _id: {toString(): string} | string;
    role?: string;
    authVersion?: number;
};

export class SessionError extends Error {
    constructor(message: string, public status = 401) {
        super(message);
    }
}

const ttlFor = (role?: string): number => {
    const key = isStaffRole(role) ? role : (role === 'caregiver' ? 'caregiver' : 'patient');
    return AUTH.refresh.idleMs[key];
};

const cookieOptions = (role?: string) => getCookieOptions(ttlFor(role));

const setCookie = (res: Response, token: string, role?: string) =>
    res.cookie(COOKIE_NAME, token, cookieOptions(role));

/** Creates a new refresh family and sets the httpOnly cookie. */
export const createSession = async (user: SessionUser, res: Response): Promise<void> => {
    const token = generateRefreshToken();
    const familyId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ttlFor(user.role));

    await RefreshSessionModel.create({
        userId: user._id.toString(),
        tokenHash: hashSecret(token),
        familyId,
        authVersion: user.authVersion ?? 0,
        expiresAt,
        revokedAt: null,
        replacedBy: null,
    });

    setCookie(res, token, user.role);
};

const readToken = (req: Request): string | undefined => req.cookies?.[COOKIE_NAME];

/** Shared eligibility checks for a user referenced by a refresh session. */
const loadSessionUser = async (userId: any, expectedAuthVersion?: number) => {
    const user = await UserModel.findById(userId);
    if (!user) throw new SessionError('User not found');
    if (user.status === 'disabled') throw new SessionError('Account disabled', 403);
    if (user.emailVerified === false) throw new SessionError('Email not verified', 403);
    if (isStaffRole(user.role) && user.verified === false) {
        throw new SessionError('Your account is pending admin approval.', 403);
    }
    if (expectedAuthVersion !== undefined && (user.authVersion ?? 0) !== expectedAuthVersion) {
        throw new SessionError('Session revoked. Please sign in again.');
    }
    return user;
};

/**
 * Validates, rotates and re-issues the refresh token. If an already-rotated
 * token is presented again, the whole family is revoked (reuse detection),
 * except for a short grace window where it is treated as a harmless parallel
 * refresh (two tabs / a retry) instead of logging the user out.
 */
export const rotateSession = async (req: Request, res: Response) => {
    const token = readToken(req);
    if (!token) throw new SessionError('No refresh token provided');

    const tokenHash = hashSecret(token);
    const now = new Date();

    // Old tokens are kept (revoked + replacedBy) until their TTL, so any reuse
    // of a previously rotated token is detectable and revokes the whole family.
    const session = await RefreshSessionModel.findOne({tokenHash});
    if (!session) throw new SessionError('Refresh token is invalid or expired');

    if (session.revokedAt) {
        if (session.replacedBy) {
            const rotatedAt = session.revokedAt.getTime();
            const withinGrace = Date.now() - rotatedAt <= AUTH.refresh.reuseGraceMs;

            if (withinGrace) {
                // The winning request already rotated this family and updated the
                // shared browser cookie. A stale request (second tab, fast retry)
                // still carried the old token, so return a valid access token
                // without revoking the family or overwriting the newer cookie.
                const active = await RefreshSessionModel.findOne({
                    familyId: session.familyId,
                    revokedAt: null,
                    expiresAt: {$gt: now},
                }).sort({createdAt: -1});

                if (active) return await loadSessionUser(active.userId, active.authVersion ?? 0);
            }

            await RefreshSessionModel.updateMany(
                {familyId: session.familyId, revokedAt: null},
                {$set: {revokedAt: now}},
            );
            throw new SessionError('Session reuse detected. Please sign in again.');
        }
        throw new SessionError('Session revoked. Please sign in again.');
    }

    if (session.expiresAt <= now) {
        throw new SessionError('Refresh token is invalid or expired');
    }

    let user;
    try {
        user = await loadSessionUser(session.userId, session.authVersion ?? 0);
    } catch (err) {
        if (err instanceof SessionError && err.message.startsWith('Session revoked')) {
            await revokeAllSessions(session.userId.toString());
        }
        throw err;
    }

    const nextToken = generateRefreshToken();
    const expiresAt = new Date(now.getTime() + ttlFor(user.role));

    // Atomic compare-and-set: only one concurrent rotation can revoke this token.
    const revoked = await RefreshSessionModel.findOneAndUpdate(
        {_id: session._id, revokedAt: null, tokenHash},
        {$set: {revokedAt: now, replacedBy: hashSecret(nextToken)}},
        {new: true},
    );
    if (!revoked) throw new SessionError('Refresh token is invalid or expired');

    await RefreshSessionModel.create({
        userId: user._id.toString(),
        tokenHash: hashSecret(nextToken),
        familyId: session.familyId,
        authVersion: user.authVersion ?? 0,
        expiresAt,
        revokedAt: null,
        replacedBy: null,
    });

    setCookie(res, nextToken, user.role);
    return user;
};

export const revokeSession = async (req: Request): Promise<void> => {
    const token = readToken(req);
    if (!token) return;
    await RefreshSessionModel.updateMany(
        {tokenHash: hashSecret(token), revokedAt: null},
        {$set: {revokedAt: new Date()}},
    );
};

export const revokeAllSessions = async (userId: string | any): Promise<void> => {
    await RefreshSessionModel.updateMany(
        {userId, revokedAt: null},
        {$set: {revokedAt: new Date()}},
    );
};

/** Logout revokes every token descended from the current login. */
export const revokeSessionFamily = async (req: Request): Promise<void> => {
    const token = readToken(req);
    if (!token) return;
    const session = await RefreshSessionModel.findOne({tokenHash: hashSecret(token)});
    if (!session) return;
    await RefreshSessionModel.updateMany(
        {familyId: session.familyId, revokedAt: null},
        {$set: {revokedAt: new Date()}},
    );
};

/** Must use the same path/domain/secure/sameSite options as createSession(). */
export const clearRefreshCookie = (res: Response, role?: string): void => {
    const options = cookieOptions(role);
    res.clearCookie(COOKIE_NAME, {
        path: options.path,
        ...(options.domain ? {domain: options.domain} : {}),
        secure: options.secure,
        sameSite: options.sameSite,
    });
};
