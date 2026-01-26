import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    email : {type: String, required: true},
    username: {type: String, required: true},
    IsOnline: {type: Boolean},
    role: { 
        type: String, 
        enum: ['patient', 'admin', 'doctor'], 
        default: 'patient' 
    },
    authentication: {
        password: {type: String, required: true, select: false},
        salt: {type: String, select: false},
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