import express from "express";
import { get } from "lodash";
import { saveSession, GameSessionModel } from "../models/GameSession";
import mongoose from "mongoose";

export const saveSessionInfo = async (req: express.Request, res: express.Response) => {
    try {
        const { title, difficulty, accuracy, score, timeTaken, completed, clientId } = req.body;

        const identity = get(req, 'identity') as any;

        if (!identity || !identity._id) {
            return res.status(403).json({ message: "User not authenticated" });
        }

        const userIdString = identity._id.toString();
        const userId = new mongoose.Types.ObjectId(userIdString);

        // Idempotent saves: offline clients retry the same save with a clientId.
        // If the record already exists, return it instead of creating a duplicate.
        if (clientId) {
            const existing = await GameSessionModel.findOne({ userId, clientId });
            if (existing) {
                return res.status(200).json(existing.toObject());
            }
        }

        const sessionInfo = await saveSession({
            userId,
            title,
            difficulty,
            accuracy,
            score,
            timeTaken,
            completed,
            clientId
        });

        return res.status(200).json(sessionInfo);

    } catch (err: any) {
        console.error("Save Session Error:", err);
        return res.status(400).json({ error: err.message });
    }
}