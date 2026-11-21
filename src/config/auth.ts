import crypto from 'crypto';
import type { CookieOptions } from 'express';

/** Roles that receive email OTP on every login and short-lived sessions. */
export const STAFF_ROLES = ['doctor', 'admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const isStaffRole = (role?: string): role is StaffRole =>
    STAFF_ROLES.includes(role as StaffRole);

export const COOKIE_NAME = 'REHAB-REFRESH';
const REFRESH_PATH = '/auth';

/** All auth timings live here so tests and docs have a single source of truth. */
export const AUTH = {
    otp: {
        length: 6,
        /** 15 min for address verification, 5 min for an active login step-up. */
        ttlMs: {
            signup_verify: 15 * 60 * 1000,
            login_2fa: 5 * 60 * 1000,
        } as const,
        maxAttempts: 5,
        lockoutMs: 15 * 60 * 1000,
        resendCooldownMs: 60 * 1000,
        maxResendsPerHour: 3,
        resendWindowMs: 60 * 60 * 1000,
    },
    jwt: {
        pendingTtl: {
            signup_verify: '15m',
            login_2fa: '5m',
        } as const,
        accessTtl: {
            patient: '30m',
            caregiver: '30m',
            doctor: '10m',
            admin: '10m',
        } as const,
        algorithm: 'HS256',
    },
    refresh: {
        idleMs: {
            patient: 7 * 24 * 60 * 60 * 1000,
            caregiver: 7 * 24 * 60 * 60 * 1000,
            doctor: 12 * 60 * 60 * 1000,
            admin: 12 * 60 * 60 * 1000,
        } as const,
    },
    passwordReset: {
        ttlMs: 15 * 60 * 1000,
        resendCooldownMs: 60 * 1000,
        maxPerHour: 3,
    },
    login: {
        maxAttempts: 10,
        lockoutMs: 15 * 60 * 1000,
    },
} as const;

export type OtpPurpose = keyof typeof AUTH.otp.ttlMs;

/**
 * Cookie options are shared by create/rotate/clear so the browser can actually
 * overwrite the cookie on logout (the old code used mismatched options).
 * Host-only by default: no hard-coded `domain: "localhost"`.
 */
export const getCookieOptions = (maxAgeMs: number): CookieOptions => {
    const options: CookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: REFRESH_PATH,
        maxAge: maxAgeMs,
    };

    if (process.env.COOKIE_DOMAIN) {
        options.domain = process.env.COOKIE_DOMAIN;
    }

    return options;
};

export const getJwtSecret = (): string => {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

    // Production is checked by validateAuthEnv() at startup. In development we
    // generate an ephemeral secret so old tokens simply stop working on restart.
    const ephemeral = crypto.randomBytes(32).toString('hex');
    console.warn('[auth] JWT_SECRET is not set — using an ephemeral development secret.');
    return ephemeral;
};

let jwtSecret: string | undefined;
export const jwtSecretOnce = (): string => {
    jwtSecret ??= getJwtSecret();
    return jwtSecret;
};

export const jwtIssuer = (): string => process.env.JWT_ISSUER || 'rehab-me';
export const jwtAudience = (): string => process.env.JWT_AUDIENCE || 'rehab-me-web';
export const frontendUrl = (): string =>
    (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

const REQUIRED_IN_PRODUCTION = ['RESEND_API_KEY', 'EMAIL_FROM', 'FRONTEND_URL', 'JWT_SECRET'] as const;

/** Fail fast in production; warn in development so local UI work can continue. */
export const validateAuthEnv = (): void => {
    const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);

    if (process.env.NODE_ENV === 'production') {
        if (missing.length) {
            throw new Error(`[auth] Missing required environment variables: ${missing.join(', ')}`);
        }
        return;
    }

    if (missing.length) {
        console.warn(`[auth] Missing optional development env vars: ${missing.join(', ')}`);
    }
};
