import express from "express";
import { get } from "lodash";
import { saveSession } from "../models/GameSession";

export const saveSessionInfo = async (req: express.Request, res: express.Response) => {
    try {
        const { title, difficulty, accuracy, score, timeTaken, completed } = req.body

        const currentUserId = get(req, 'identity._id') as string;

        if (!currentUserId) {
            return res.sendStatus(403)
        }

        const sessionInfo = await saveSession({
            userId: currentUserId,
            title,
            difficulty,
            accuracy,
            score,
            timeTaken,
            completed
        })

        return res.status(200).json(sessionInfo)

    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}                                           