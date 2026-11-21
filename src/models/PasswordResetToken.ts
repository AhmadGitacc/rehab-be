import mongoose from 'mongoose';

const PasswordResetTokenSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    /** HMAC of the 32-byte random token — the raw token only exists in the email link. */
    tokenHash: {type: String, required: true, unique: true, index: true},
    expiresAt: {type: Date, required: true},
    usedAt: {type: Date, default: null},
}, {timestamps: true});

PasswordResetTokenSchema.index({expiresAt: 1}, {expireAfterSeconds: 0});

export const PasswordResetTokenModel = mongoose.model('PasswordResetToken', PasswordResetTokenSchema);
