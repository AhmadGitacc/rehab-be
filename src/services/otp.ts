import { AUTH, type OtpPurpose } from '../config/auth';
import { generateOtp, hashSecret, safeCompare } from '../helpers/tokens';
import { EmailOtpModel } from '../models/EmailOtp';

export class OtpError extends Error {
    constructor(
        message: string,
        public status = 400,
        public retryAfter?: number,
    ) {
        super(message);
    }
}

type IssuedOtp = {code: string; expiresAt: Date; resendIn: number};

const ttlFor = (purpose: OtpPurpose) => AUTH.otp.ttlMs[purpose];

/** Rotate any active OTP, store only its HMAC, and return the plaintext once. */
export const issueOtp = async (userId: string | any, purpose: OtpPurpose): Promise<IssuedOtp> => {
    const now = new Date();
    const code = generateOtp();
    const expiresAt = new Date(now.getTime() + ttlFor(purpose));

    await EmailOtpModel.updateMany(
        {userId, purpose, consumedAt: null},
        {$set: {consumedAt: now}},
    );

    await EmailOtpModel.create({
        userId,
        purpose,
        codeHash: hashSecret(code),
        attempts: 0,
        expiresAt,
        consumedAt: null,
        resendCount: 0,
        resendWindowStart: now,
        cooldownUntil: new Date(now.getTime() + AUTH.otp.resendCooldownMs),
    });

    return {code, expiresAt, resendIn: Math.ceil(AUTH.otp.resendCooldownMs / 1000)};
};

const retryAfterSeconds = (until?: Date | null): number | undefined => {
    if (!until) return undefined;
    const seconds = Math.ceil((until.getTime() - Date.now()) / 1000);
    return seconds > 0 ? seconds : undefined;
};

/**
 * For the email-only verification fallback: when the original code has expired
 * (or was never active), issue a fresh one while still applying the same
 * cooldown and hourly cap across every code issued for this purpose.
 */
export const resendOrIssueOtp = async (
    userId: string | any,
    purpose: OtpPurpose,
): Promise<IssuedOtp> => {
    const now = new Date();

    const [latest, recent] = await Promise.all([
        EmailOtpModel.findOne({userId, purpose}).sort({createdAt: -1}),
        EmailOtpModel.find({
            userId,
            purpose,
            createdAt: {$gt: new Date(now.getTime() - AUTH.otp.resendWindowMs)},
        })
            .sort({createdAt: -1})
            .limit(AUTH.otp.maxResendsPerHour),
    ]);

    const lockedFor = retryAfterSeconds(latest?.cooldownUntil);
    if (lockedFor) {
        throw new OtpError('Please wait before requesting another code.', 429, lockedFor);
    }
    if (recent.length >= AUTH.otp.maxResendsPerHour) {
        throw new OtpError('Too many codes requested. Try again later.', 429);
    }

    return issueOtp(userId, purpose);
};

/**
 * Atomic verify: increments attempts only while below the limit, compares in
 * constant time, then consumes with a compare-and-set so it is single-use.
 */
export const verifyOtp = async (
    userId: string | any,
    purpose: OtpPurpose,
    code: string,
): Promise<void> => {
    const now = new Date();
    const active = await EmailOtpModel.findOne({userId, purpose, consumedAt: null});

    if (!active || active.expiresAt <= now) {
        throw new OtpError('Invalid or expired code. Request a new one.');
    }

    const lockedFor = retryAfterSeconds(active.cooldownUntil);
    if (active.attempts >= AUTH.otp.maxAttempts || (lockedFor && lockedFor > AUTH.otp.resendCooldownMs / 1000)) {
        throw new OtpError('Too many incorrect codes. Try again later.', 429, lockedFor);
    }

    const incremented = await EmailOtpModel.findOneAndUpdate(
        {_id: active._id, consumedAt: null, attempts: {$lt: AUTH.otp.maxAttempts}},
        {$inc: {attempts: 1}},
        {new: true},
    );

    if (!incremented) {
        throw new OtpError('Too many incorrect codes. Try again later.', 429, retryAfterSeconds(active.cooldownUntil));
    }

    if (!safeCompare(hashSecret(code), incremented.codeHash)) {
        const attemptsLeft = Math.max(0, AUTH.otp.maxAttempts - incremented.attempts);
        if (attemptsLeft === 0) {
            const until = new Date(now.getTime() + AUTH.otp.lockoutMs);
            await EmailOtpModel.updateOne({_id: incremented._id}, {$set: {cooldownUntil: until}});
            throw new OtpError('Too many incorrect codes. Try again in 15 minutes.', 429,
                Math.ceil(AUTH.otp.lockoutMs / 1000));
        }
        throw new OtpError(`Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.`);
    }

    const consumed = await EmailOtpModel.findOneAndUpdate(
        {_id: incremented._id, consumedAt: null},
        {$set: {consumedAt: now}},
        {new: true},
    );

    if (!consumed) {
        throw new OtpError('This code was already used. Request a new one.');
    }
};

/** 60s cooldown + max 3 resends/hour. Failed-attempt count is preserved. */
export const resendOtp = async (userId: string | any, purpose: OtpPurpose): Promise<IssuedOtp> => {
    const now = new Date();
    const active = await EmailOtpModel.findOne({userId, purpose, consumedAt: null});

    if (!active || active.expiresAt <= now) {
        throw new OtpError('No active code. Request a new one.');
    }

    const lockedFor = retryAfterSeconds(active.cooldownUntil);
    if (lockedFor) {
        throw new OtpError('Please wait before requesting another code.', 429, lockedFor);
    }

    const windowExpired = !active.resendWindowStart ||
        active.resendWindowStart.getTime() + AUTH.otp.resendWindowMs <= now.getTime();
    const resendCount = windowExpired ? 0 : active.resendCount;
    if (resendCount >= AUTH.otp.maxResendsPerHour) {
        throw new OtpError('Too many codes requested. Try again later.', 429);
    }

    const code = generateOtp();
    const expiresAt = new Date(now.getTime() + ttlFor(purpose));

    const updated = await EmailOtpModel.findOneAndUpdate(
        {_id: active._id, consumedAt: null},
        {
            $set: {
                codeHash: hashSecret(code),
                expiresAt,
                cooldownUntil: new Date(now.getTime() + AUTH.otp.resendCooldownMs),
                resendCount: resendCount + 1,
                resendWindowStart: windowExpired ? now : active.resendWindowStart,
            },
        },
        {new: true},
    );

    if (!updated) throw new OtpError('No active code. Request a new one.');

    return {code, expiresAt, resendIn: Math.ceil(AUTH.otp.resendCooldownMs / 1000)};
};
