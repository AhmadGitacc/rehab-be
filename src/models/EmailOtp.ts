import mongoose from 'mongoose';

export type OtpPurpose = 'signup_verify' | 'login_2fa';

const EmailOtpSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    purpose: {
        type: String,
        enum: ['signup_verify', 'login_2fa'],
        required: true,
    },
    /** HMAC of the 6-digit code — the plaintext is only ever sent by email. */
    codeHash: {type: String, required: true},
    attempts: {type: Number, default: 0},
    expiresAt: {type: Date, required: true},
    consumedAt: {type: Date, default: null},
    resendCount: {type: Number, default: 0},
    resendWindowStart: {type: Date, default: null},
    cooldownUntil: {type: Date, default: null},
}, {timestamps: true});

/** Exactly one active OTP per (user, purpose) — rotated on every issue. */
EmailOtpSchema.index(
    {userId: 1, purpose: 1},
    {unique: true, partialFilterExpression: {consumedAt: null}},
);

/** MongoDB removes expired OTP documents automatically. */
EmailOtpSchema.index({expiresAt: 1}, {expireAfterSeconds: 0});

export const EmailOtpModel = mongoose.model('EmailOtp', EmailOtpSchema);
