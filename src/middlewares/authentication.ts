import express from "express";
import { get, merge } from "lodash";
import { verifyToken, type AuthClaims } from "../helpers/tokens";
import { getUserBySessionToken, getUserById } from "../models/User";

let legacyWarningLogged = false;

/** Verifies the Bearer access JWT, then re-loads the user from the DB. */
export const isAuthenticated = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

        if (accessToken) {
            const claims: AuthClaims = verifyToken(accessToken, 'access');
            const user = await getUserById(claims.sub);

            if (!user) return res.status(401).json({message: 'User not found'});
            if (user.role !== claims.role) return res.status(401).json({message: 'Session is no longer valid'});
            if ((user.authVersion ?? 0) !== claims.authVersion) {
                return res.status(401).json({message: 'Session has been revoked'});
            }
            if (user.status === 'disabled') return res.status(403).json({message: 'Account disabled'});
            if (user.emailVerified === false) return res.status(403).json({message: 'Email not verified'});

            merge(req, {identity: user});
            return next();
        }

        // Temporary rollout bridge for clients that still send the opaque session token.
        if (process.env.ALLOW_LEGACY_SESSION === 'true') {
            const legacyToken = (req as any).cookies?.['REHAB-AUTH'] ||
                (authHeader ? authHeader.split(' ')[1] : undefined);
            if (legacyToken) {
                if (!legacyWarningLogged) {
                    console.warn('[auth] legacy session token accepted — remove ALLOW_LEGACY_SESSION after rollout');
                    legacyWarningLogged = true;
                }
                const existingUser = await getUserBySessionToken(legacyToken);
                if (existingUser && existingUser.status !== 'disabled' && existingUser.emailVerified !== false) {
                    merge(req, {identity: existingUser});
                    return next();
                }
            }
        }

        return res.status(401).json({message: 'Authentication required'});
    } catch (err) {
        // Missing/expired/invalid JWTs are 401 so the client can try a refresh.
        return res.status(401).json({message: 'Authentication required'});
    }
};

export const isOwner = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        const { id } = req.params

        const currentUserId = get(req, 'identity._id') as string;
        const currentUserRole = get(req, 'identity.role') as string;

        if (!currentUserId) {
            return res.sendStatus(403)
        }

        if (currentUserRole === 'admin' || currentUserRole === 'doctor') {
            return next();
        }

        if (currentUserId.toString() != id) {
            return res.sendStatus(403)
        }

        next()

    } catch (err) {
        console.log(err)
        return res.status(400).json({ message: 'Authorization failed' })

    }
}

export const isAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        const currentUser = get(req, 'identity') as any;
        const currentUserRole = currentUser?.role as string;

        if (currentUserRole !== 'admin' && currentUserRole !== 'doctor') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        if (currentUserRole === 'doctor' && currentUser?.verified === false) {
            return res.status(403).json({ message: 'Your account is pending admin approval.' });
        }

        return next();

    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}

export const isCaregiver = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        const currentUser = get(req, 'identity.role') as string;

        if (currentUser !== 'caregiver') {
            return res.status(403).json({ message: 'Caregiver access required' });
        }

        return next();

    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}

export const isSuperAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        const currentUser = get(req, 'identity.role') as string;

        if (currentUser !== 'admin') {
            return res.status(403).json({ message: 'Admin only' });
        }

        return next();

    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}
