import express from 'express';
import { AUTH, frontendUrl, isStaffRole } from '../config/auth';
import { authentication, random } from '../helpers';
import {
    generateResetToken,
    hashSecret,
    safeCompare,
    signAccessToken,
    signPendingToken,
    toPublicUser,
    verifyToken,
    type AuthClaims,
} from '../helpers/tokens';
import { PasswordResetTokenModel } from '../models/PasswordResetToken';
import { createUser, getUserByEmail, getUserById, updateUserById, UserModel } from '../models/User';
import { EmailDeliveryError, sendOtpEmail, sendPasswordChangedEmail, sendResetEmail } from '../services/email';
import { issueOtp, OtpError, resendOtp, verifyOtp } from '../services/otp';
import {
    clearRefreshCookie,
    createSession,
    revokeAllSessions,
    revokeSessionFamily,
    rotateSession,
    SessionError,
} from '../services/session';

const GENERIC_LOGIN_ERROR = 'Invalid email or password';
const GENERIC_FORGOT_MESSAGE = 'If that email has an account, we sent reset instructions.';
const GENERIC_RESEND_MESSAGE = 'If the account needs verification, a new code has been sent.';

const normalizeEmail = (value: unknown): string =>
    typeof value === 'string' ? value.trim().toLowerCase() : '';

/** Basic policy shared by signup and password reset. */
const isStrongPassword = (password: unknown): password is string =>
    typeof password === 'string' && password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);

const maskEmail = (email: string): string => {
    const [local, domain] = email.split('@');
    if (!domain) return 'your email';
    return `${local.slice(0, 1)}***${local.length > 2 ? local.slice(-1) : ''}@${domain}`;
};

/** Same amount of HMAC work whether or not the account exists. */
const dummyPasswordCheck = () => authentication(random(), 'no-such-account');

const retryAfter = (seconds?: number) => {
    if (seconds && seconds > 0) return seconds;
    return undefined;
};

/** One consistent error envelope for auth endpoints. */
const authError = (
    res: express.Response,
    err: unknown,
    fallbackMessage = 'Authentication failed',
): express.Response => {
    if (err instanceof OtpError || err instanceof SessionError) {
        const seconds = retryAfter((err as any).retryAfter);
        if (seconds) res.setHeader('Retry-After', String(seconds));
        return res.status(err.status).json({message: err.message});
    }
    if (err instanceof EmailDeliveryError) {
        return res.status(503).json({message: err.message});
    }
    if (err instanceof Error && err.name === 'TokenExpiredError') {
        return res.status(401).json({message: 'Your verification link has expired. Please start again.'});
    }
    if (err instanceof Error && err.name === 'JsonWebTokenError') {
        return res.status(401).json({message: 'Invalid or expired verification session.'});
    }
    console.error('[auth] unexpected error:', err);
    return res.status(500).json({message: 'Internal Server Error'});
};

/** Loads the user referenced by a pending JWT and checks it is still eligible. */
const userFromPendingToken = async (token: string, purpose: 'signup_verify' | 'login_2fa') => {
    const claims: AuthClaims = verifyToken(token, purpose);
    const user = await getUserById(claims.sub);
    if (!user) throw new SessionError('Account not found', 401);
    if ((claims.role !== user.role) || ((user.authVersion ?? 0) !== claims.authVersion)) {
        throw new SessionError('Your verification session is no longer valid. Please start again.', 401);
    }
    if (user.status === 'disabled') throw new SessionError('Account disabled', 403);
    return {claims, user};
};

/** POST /auth/register */
export const Register = async (req: express.Request, res: express.Response) => {
    try {
        const {username, password, role, phone} = req.body;
        const email = normalizeEmail(req.body.email);

        if (!email || !username || !password) {
            return res.status(400).json({message: 'Missing required fields'});
        }
        if (!isStrongPassword(password)) {
            return res.status(400).json({message: 'Password must be at least 8 characters with a letter and a number.'});
        }

        const existingUser = await getUserByEmail(email);
        if (existingUser) return res.status(409).json({message: 'Email already in use'});

        const allowedRoles = ['patient', 'doctor', 'caregiver'];
        const requestedRole = allowedRoles.includes(role) ? role : 'patient';
        if (requestedRole === 'doctor' && !phone) {
            return res.status(400).json({message: 'Phone number is required for doctor accounts'});
        }

        const salt = random();
        const newUser = await createUser({
            email,
            username: String(username).trim(),
            role: requestedRole,
            phone: phone || '',
            emailVerified: false,
            // `verified` remains the doctor admin-approval flag.
            verified: requestedRole === 'doctor' ? false : true,
            authentication: {salt, password: authentication(salt, password)},
        });

        const {code, resendIn} = await issueOtp((newUser as any)._id, 'signup_verify');
        await sendOtpEmail(email, code, 'signup_verify');

        const pendingToken = signPendingToken(newUser as any, 'signup_verify');

        return res.status(200).json({
            requiresEmailVerification: true,
            email,
            pendingToken,
            expiresIn: AUTH.otp.ttlMs.signup_verify / 1000,
            resendIn,
        });
    } catch (err: any) {
        if (err?.code === 11000) return res.status(409).json({message: 'Email already in use'});
        return authError(res, err, 'Registration failed');
    }
};

/** POST /auth/verify-email */
export const VerifyEmail = async (req: express.Request, res: express.Response) => {
    try {
        const {pendingToken, code, email} = req.body;
        if (!code) return res.status(400).json({message: 'Missing required fields'});

        let user: any;
        if (pendingToken) {
            user = (await userFromPendingToken(pendingToken, 'signup_verify')).user;
        } else {
            // Fallback for a lost pending token: the emailed code plus its address.
            const normalized = normalizeEmail(email);
            if (!normalized) return res.status(400).json({message: 'Missing required fields'});
            user = await getUserByEmail(normalized);
            if (!user) return res.status(400).json({message: 'Invalid or expired code. Request a new one.'});
        }
        if (user.emailVerified) {
            return res.status(400).json({message: 'Email already verified. Please sign in.'});
        }

        await verifyOtp(user._id, 'signup_verify', String(code).trim());
        user.emailVerified = true;
        user.loginAttempts = 0;
        user.loginLockedUntil = null;
        await user.save();

        if (isStaffRole(user.role)) {
            return res.status(200).json({
                requiresAdminApproval: true,
                user: toPublicUser(user.toObject()),
            });
        }

        user.IsOnline = true;
        await createSession(user, res);
        return res.status(200).json({
            accessToken: signAccessToken(user as any),
            user: toPublicUser(user.toObject()),
        });
    } catch (err) {
        return authError(res, err);
    }
};

/** POST /auth/resend-verification — always returns the same generic response. */
export const ResendVerification = async (req: express.Request, res: express.Response) => {
    try {
        const email = normalizeEmail(req.body.email);
        if (!email) return res.status(200).json({message: GENERIC_RESEND_MESSAGE});

        const user = await getUserByEmail(email);
        if (user && !user.emailVerified) {
            try {
                const {code} = await resendOtp(user._id, 'signup_verify');
                await sendOtpEmail(email, code, 'signup_verify');
            } catch (err) {
                // Do not reveal cooldown/lockout/delivery state to unauthenticated callers.
                if (!(err instanceof OtpError) && !(err instanceof EmailDeliveryError)) {
                    console.error('[auth] resend verification failed:', err);
                }
            }
        }

        return res.status(200).json({message: GENERIC_RESEND_MESSAGE});
    } catch (err) {
        return authError(res, err);
    }
};

/** POST /auth/login */
export const Login = async (req: express.Request, res: express.Response) => {
    try {
        const email = normalizeEmail(req.body.email);
        const {password} = req.body;

        if (!email || !password) return res.status(400).json({message: 'Missing required fields'});

        const user = await getUserByEmail(email).select('+authentication.password +authentication.salt');
        if (!user) {
            dummyPasswordCheck();
            return res.status(401).json({message: GENERIC_LOGIN_ERROR});
        }

        const lockedFor = user.loginLockedUntil
            ? Math.ceil((user.loginLockedUntil.getTime() - Date.now()) / 1000)
            : 0;
        if (lockedFor > 0) {
            res.setHeader('Retry-After', String(lockedFor));
            return res.status(429).json({message: 'Too many failed sign-in attempts. Try again later.'});
        }

        const expectedHash = authentication(user.authentication.salt, password);
        if (!safeCompare(expectedHash, user.authentication.password)) {
            const attempts = (user.loginAttempts ?? 0) + 1;
            if (attempts >= AUTH.login.maxAttempts) {
                user.loginAttempts = attempts;
                user.loginLockedUntil = new Date(Date.now() + AUTH.login.lockoutMs);
                await user.save();
                res.setHeader('Retry-After', String(AUTH.login.lockoutMs / 1000));
                return res.status(429).json({message: 'Too many failed sign-in attempts. Try again later.'});
            }
            user.loginAttempts = attempts;
            await user.save();
            return res.status(401).json({message: GENERIC_LOGIN_ERROR});
        }

        if (user.status === 'disabled') {
            return res.status(403).json({message: 'Your account has been disabled. Contact your administrator.'});
        }
        if (!user.emailVerified) {
            return res.status(403).json({message: 'Please verify your email before signing in.'});
        }
        if (user.role === 'doctor' && user.verified === false) {
            return res.status(403).json({message: 'Your account is pending admin approval.'});
        }

        user.loginAttempts = 0;
        user.loginLockedUntil = null;
        await user.save();

        if (isStaffRole(user.role)) {
            const {code, resendIn} = await issueOtp(user._id, 'login_2fa');
            await sendOtpEmail(user.email, code, 'login_2fa');

            return res.status(200).json({
                requiresTwoFactor: true,
                pendingToken: signPendingToken(user as any, 'login_2fa'),
                expiresIn: AUTH.otp.ttlMs.login_2fa / 1000,
                resendIn,
                emailMasked: maskEmail(user.email),
            });
        }

        user.IsOnline = true;
        await user.save();
        await createSession(user, res);

        return res.status(200).json({
            accessToken: signAccessToken(user as any),
            user: toPublicUser(user.toObject()),
        });
    } catch (err) {
        return authError(res, err);
    }
};

/** POST /auth/verify-2fa */
export const Verify2fa = async (req: express.Request, res: express.Response) => {
    try {
        const {pendingToken, code} = req.body;
        if (!pendingToken || !code) return res.status(400).json({message: 'Missing required fields'});

        const {user} = await userFromPendingToken(pendingToken, 'login_2fa');
        if (!isStaffRole(user.role)) throw new SessionError('Two-factor verification is not required for this account.', 400);
        if (user.verified === false) throw new SessionError('Your account is pending admin approval.', 403);

        await verifyOtp(user._id, 'login_2fa', String(code).trim());

        user.IsOnline = true;
        await user.save();
        await createSession(user, res);

        return res.status(200).json({
            accessToken: signAccessToken(user as any),
            user: toPublicUser(user.toObject()),
        });
    } catch (err) {
        return authError(res, err);
    }
};

/** POST /auth/resend-2fa */
export const Resend2fa = async (req: express.Request, res: express.Response) => {
    try {
        const {pendingToken} = req.body;
        if (!pendingToken) return res.status(400).json({message: 'Missing required fields'});

        const {user} = await userFromPendingToken(pendingToken, 'login_2fa');
        const {code, resendIn} = await resendOtp(user._id, 'login_2fa');
        await sendOtpEmail(user.email, code, 'login_2fa');

        return res.status(200).json({message: 'A new code has been sent.', resendIn});
    } catch (err) {
        return authError(res, err);
    }
};

/** POST /auth/refresh */
export const Refresh = async (req: express.Request, res: express.Response) => {
    try {
        const user = await rotateSession(req, res);
        return res.status(200).json({
            accessToken: signAccessToken(user as any),
            user: toPublicUser((user as any).toObject()),
        });
    } catch (err) {
        return authError(res, err);
    }
};

/** POST /auth/logout — works without an email body or a valid access token. */
export const Logout = async (req: express.Request, res: express.Response) => {
    try {
        let user: any;

        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            try {
                const claims = verifyToken(authHeader.slice(7), 'access');
                user = await getUserById(claims.sub);
            } catch {
                // An expired access token must not prevent clearing the cookie.
            }
        }

        await revokeSessionFamily(req);
        clearRefreshCookie(res, user?.role);

        if (user) await updateUserById(user._id.toString(), {IsOnline: false});

        return res.status(200).json({message: 'Logged out successfully'});
    } catch (err) {
        console.error('[auth] logout error:', err);
        return res.status(500).json({message: 'Internal Server Error'});
    }
};

/** GET /auth/me */
export const Me = async (req: express.Request, res: express.Response) => {
    try {
        const identity = (req as any).identity;
        if (!identity) return res.status(401).json({message: 'Not authenticated'});
        return res.status(200).json(toPublicUser(identity.toObject?.() ?? identity));
    } catch (err) {
        return authError(res, err);
    }
};

/** Per-IP limiter. In-memory only (per process); the per-account limit is durable. */
const ipResetLimits = new Map<string, {windowStart: number; count: number; lastAt: number}>();

const ipRateLimited = (req: express.Request): boolean => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const record = ipResetLimits.get(key);
    if (!record || now - record.windowStart > 60 * 60 * 1000) {
        ipResetLimits.set(key, {windowStart: now, count: 1, lastAt: now});
        return false;
    }
    if (now - record.lastAt < AUTH.passwordReset.resendCooldownMs) return true;
    if (record.count >= AUTH.passwordReset.maxPerHour) return true;
    record.count += 1;
    record.lastAt = now;
    return false;
};

/** POST /auth/forgot-password — identical response for known/unknown emails. */
export const ForgotPassword = async (req: express.Request, res: express.Response) => {
    try {
        const email = normalizeEmail(req.body.email);
        const user = email ? await getUserByEmail(email) : null;

        if (!user) {
            dummyPasswordCheck();
            return res.status(200).json({message: GENERIC_FORGOT_MESSAGE});
        }

        // Per-account cooldown + hourly cap, checked against existing records.
        const since = new Date(Date.now() - 60 * 60 * 1000);
        const recent = await PasswordResetTokenModel.find({userId: user._id, createdAt: {$gt: since}})
            .sort({createdAt: -1})
            .limit(AUTH.passwordReset.maxPerHour);
        const tooSoon = recent[0] && Date.now() - (recent[0] as any).createdAt.getTime() < AUTH.passwordReset.resendCooldownMs;
        if (tooSoon || recent.length >= AUTH.passwordReset.maxPerHour || ipRateLimited(req)) {
            return res.status(200).json({message: GENERIC_FORGOT_MESSAGE});
        }

        const token = generateResetToken();
        await PasswordResetTokenModel.updateMany(
            {userId: user._id, usedAt: null},
            {$set: {usedAt: new Date()}},
        );
        await PasswordResetTokenModel.create({
            userId: user._id,
            tokenHash: hashSecret(token),
            expiresAt: new Date(Date.now() + AUTH.passwordReset.ttlMs),
            usedAt: null,
        });

        const url = `${frontendUrl()}/reset-password?token=${encodeURIComponent(token)}`;
        try {
            await sendResetEmail(user.email, url);
        } catch (err) {
            // Keep the response identical whether or not the address exists.
            if (!(err instanceof EmailDeliveryError)) throw err;
        }

        return res.status(200).json({message: GENERIC_FORGOT_MESSAGE});
    } catch (err) {
        return authError(res, err);
    }
};

/** POST /auth/validate-reset-token — non-consuming validity check. */
export const ValidateResetToken = async (req: express.Request, res: express.Response) => {
    try {
        const {token} = req.body;
        if (typeof token !== 'string' || !token) return res.status(200).json({valid: false});

        const record = await PasswordResetTokenModel.findOne({
            tokenHash: hashSecret(token),
            usedAt: null,
            expiresAt: {$gt: new Date()},
        });
        return res.status(200).json({valid: Boolean(record)});
    } catch (err) {
        return authError(res, err);
    }
};

/** POST /auth/reset-password — single-use, invalidates every session. */
export const ResetPassword = async (req: express.Request, res: express.Response) => {
    try {
        const {token, password, confirmPassword} = req.body;

        if (typeof token !== 'string' || !token) {
            return res.status(400).json({message: 'Invalid reset link'});
        }
        if (!isStrongPassword(password)) {
            return res.status(400).json({message: 'Password must be at least 8 characters with a letter and a number.'});
        }
        if (password !== confirmPassword) {
            return res.status(400).json({message: 'Passwords do not match'});
        }

        const consumed = await PasswordResetTokenModel.findOneAndUpdate(
            {
                tokenHash: hashSecret(token),
                usedAt: null,
                expiresAt: {$gt: new Date()},
            },
            {$set: {usedAt: new Date()}},
            {new: true},
        );
        if (!consumed) return res.status(400).json({message: 'This reset link is invalid or has expired.'});

        const user = await getUserById(consumed.userId.toString());
        if (!user) return res.status(400).json({message: 'This reset link is invalid or has expired.'});
        if (user.status === 'disabled') {
            return res.status(403).json({message: 'Your account has been disabled. Contact your administrator.'});
        }

        const salt = random();
        user.authentication.salt = salt;
        user.authentication.password = authentication(salt, password);
        user.authVersion = (user.authVersion ?? 0) + 1;
        user.loginAttempts = 0;
        user.loginLockedUntil = null;
        user.IsOnline = false;
        await user.save();

        await PasswordResetTokenModel.updateMany(
            {userId: user._id, usedAt: null},
            {$set: {usedAt: new Date()}},
        );
        await revokeAllSessions(user._id.toString());
        try {
            await sendPasswordChangedEmail(user.email);
        } catch (err) {
            // The password was already changed — do not roll it back over mail delivery.
            if (!(err instanceof EmailDeliveryError)) throw err;
        }

        return res.status(200).json({message: 'Password reset. Please sign in.'});
    } catch (err) {
        return authError(res, err);
    }
};
