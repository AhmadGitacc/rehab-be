import mongoose from "mongoose";

const CATEGORIES = ['memory', 'coordination', 'reaction', 'auditory'] as const;

const UserSchema = new mongoose.Schema({
    /** Normalised in the auth controller; unique index requires a pre-deploy dedupe. */
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    username: {type: String, required: true},
    phone: {type: String, default: ''},
    IsOnline: {type: Boolean},
    role: {
        type: String,
        enum: ['patient', 'admin', 'doctor', 'caregiver'],
        default: 'patient'
    },
    /** Email address verification (new signup OTP flow). */
    emailVerified: {type: Boolean, default: false},
    /** Doctor admin-approval flag — NOT the same as emailVerified. */
    verified: {type: Boolean, default: true},
    /** Account access state. Missing on legacy documents → treated as active. */
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    /** Bumped on password reset / disable / role change to revoke issued JWTs. */
    authVersion: {type: Number, default: 0},
    /** Password login lockout counters. */
    loginAttempts: {type: Number, default: 0},
    loginLockedUntil: {type: Date, default: null},
    careLinkCode: { type: String, default: null, index: true },
    assignedDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    linkedPatientIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
    assignedCategories: { type: [String], enum: CATEGORIES, default: [] },
    dailyGoal: { type: Number, default: 10, min: 1, max: 50 },
    authentication: {
        password: {type: String, required: true, select: false},
        salt: {type: String, select: false},
        /** Legacy opaque session token — removed in a follow-up release. */
        sessionToken: {type: String, select: false},
    }
})

export const UserModel = mongoose.model('User', UserSchema)

export const getUsers = () => UserModel.find()
export const getUserById = (id: String) => UserModel.findById(id)
export const getUserByEmail = (email: String) => UserModel.findOne({ email });
export const getUserBySessionToken = (sessionToken: String) => UserModel.findOne({
    'authentication.sessionToken': sessionToken
});
export const createUser = (values: Record<string, any>) => new UserModel(values).save()
.then((user) => user.toObject());
export const updateUserById = (id: String, values: Record<string, any>) => UserModel.findByIdAndUpdate(id, values);
export const deleteUserById = (id: String) => UserModel.findByIdAndDelete(id);
