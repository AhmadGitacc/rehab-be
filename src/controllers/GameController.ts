import express from "express";
import { get } from "lodash";
import { saveSession } from "../models/GameSession";
import mongoose from "mongoose";

export const saveSessionInfo = async (req: express.Request, res: express.Response) => {
    try {
        const { title, difficulty, accuracy, score, timeTaken, completed } = req.body;

        const identity = get(req, 'identity') as any;

        if (!identity || !identity._id) {
            return res.status(403).json({ message: "User not authenticated" });
        }

        const userIdString = identity._id.toString();

        const sessionInfo = await saveSession({
            userId: new mongoose.Types.ObjectId(userIdString),
            title,
            difficulty,
            accuracy,
            score,
            timeTaken,
            completed
        });

        return res.status(200).json(sessionInfo);

    } catch (err: any) {
        console.error("Save Session Error:", err);
        return res.status(400).json({ error: err.message });
    }
}                  