import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { AUTH, isStaffRole, jwtAudience, jwtIssuer, jwtSecretOnce, type OtpPurpose } from '../config/auth';

export type TokenPurpose = 'access' | OtpPurpose;

export interface AuthClaims extends jwt.JwtPayload {
    sub: string;
    role: string;
    authVersion: number;
    purpose: TokenPurpose;
    iss: string;
    aud: string;
    jti: string;
    iat: number;
    exp: number;
}

type TokenUser = {
    _id: { toString(): string } | string;
    role?: string;
    authVersion?: number;
};

const baseClaims = (user: TokenUser, purpose: TokenPurpose) => {
    const sub = user._id.toString();
    return {
        sub,
        role: user.role || 'patient',
        authVersion: user.authVersion ?? 0,
        purpose,
        jti: crypto.randomUUID(),
    };
};

const sign = (user: TokenUser, purpose: TokenPurpose, expiresIn: string): string =>
    jwt.sign(baseClaims(user, purpose), jwtSecretOnce(), {
        algorithm: AUTH.jwt.algorithm,
        expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
        issuer: jwtIssuer(),
        audience: jwtAudience(),
    });

/** 30 min for patients/caregivers, 10 min for doctors/admins. */
export const signAccessToken = (user: TokenUser): string => {
    const role = user.role || 'patient';
    const ttl = AUTH.jwt.accessTtl[role as keyof typeof AUTH.jwt.accessTtl] || AUTH.jwt.accessTtl.patient;
    return sign(user, 'access', ttl);
};

/** 15 min for signup verification, 5 min for the staff login 2FA step. */
export const signPendingToken = (user: TokenUser, purpose: OtpPurpose): string =>
    sign(user, purpose, AUTH.jwt.pendingTtl[purpose]);

/** Verifies signature + all registered claims and the expected purpose. */
export const verifyToken = (token: string, expectedPurpose: TokenPurpose): AuthClaims => {
    const decoded = jwt.verify(token, jwtSecretOnce(), {
        algorithms: [AUTH.jwt.algorithm],
        issuer: jwtIssuer(),
        audience: jwtAudience(),
    }) as AuthClaims;

    if (!decoded.sub || !decoded.role || typeof decoded.authVersion !== 'number') {
        throw new jwt.JsonWebTokenError('Malformed token claims');
    }
    if (decoded.purpose !== expectedPurpose) {
        throw new jwt.JsonWebTokenError('Token purpose mismatch');
    }
    if (isStaffRole(decoded.role) && !decoded.jti) {
        throw new jwt.JsonWebTokenError('Missing jti');
    }

    return decoded;
};

/** HMAC-SHA256 keyed by JWT_SECRET; used to store secrets without plaintext. */
export const hashSecret = (value: string): string =>
    crypto.createHmac('sha256', jwtSecretOnce()).update(value).digest('hex');

/** Constant-time comparison that also handles unequal-length inputs. */
export const safeCompare = (a: string, b: string): boolean => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
};

export const generateOtp = (): string =>
    crypto.randomInt(0, 1_000_000).toString().padStart(AUTH.otp.length, '0');

export const generateResetToken = (): string => crypto.randomBytes(32).toString('base64url');

/** Opaque 256-bit refresh token — never stored in plaintext. */
export const generateRefreshToken = (): string => crypto.randomBytes(32).toString('base64url');

/** Only safe fields are returned to clients. */
export const toPublicUser = (user: Record<string, any>) => {
    const {
        _id, username, email, role, phone, IsOnline, verified, emailVerified,
        status, assignedDoctorId, linkedPatientIds, assignedCategories, dailyGoal,
        careLinkCode,
    } = user;
    return {
        _id: _id?.toString(),
        id: _id?.toString(),
        username,
        email,
        role,
        phone: phone || '',
        IsOnline: Boolean(IsOnline),
        verified: Boolean(verified),
        emailVerified: Boolean(emailVerified),
        status: status || 'active',
        assignedDoctorId: assignedDoctorId || null,
        linkedPatientIds: linkedPatientIds || [],
        assignedCategories: assignedCategories || [],
        dailyGoal: dailyGoal ?? 10,
        careLinkCode: careLinkCode || null,
    };
};
