import mongoose from 'mongoose';

const RefreshSessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    /** HMAC of the opaque 256-bit refresh token. */
    tokenHash: {type: String, required: true, unique: true, index: true},
    /** All tokens descended from one login share a family; reuse revokes the family. */
    familyId: {type: String, required: true, index: true},
    /** Snapshot of the user's authVersion at issue time; bumping it revokes the session. */
    authVersion: {type: Number, default: 0},
    expiresAt: {type: Date, required: true},
    revokedAt: {type: Date, default: null},
    replacedBy: {type: String, default: null},
}, {timestamps: true});

RefreshSessionSchema.index({expiresAt: 1}, {expireAfterSeconds: 0});

export const RefreshSessionModel = mongoose.model('RefreshSession', RefreshSessionSchema);
