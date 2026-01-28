import mongoose from "mongoose";

const SessionSchema = new mongoose.Schema({
    userId: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    title: {type: String, required: true},
    difficulty: {type: String, required: true},
    accuracy: {type: Number, required: true},
    score: {type: Number, required: true},
    timeTaken: {type: Number, required: true},//in millisecs??
    completed: {type: Boolean, required: true},
    completedAt: { type: Date, default: Date.now }
})

export const GameSessionModel = mongoose.model('GameSession', SessionSchema)

export const saveSession = (values: Record<string,any>) => new GameSessionModel(values).save()
.then((game) => game.toObject())