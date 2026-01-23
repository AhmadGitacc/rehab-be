import express from 'express';
import { GameSessionModel } from '../models/GameSession';
import mongoose from 'mongoose';

export const getAnalytics = async (req: express.Request, res: express.Response) => {
    try {
        const { id } = req.params;
        const { timeframe } = req.query;

        let startDate = new Date(0);
        const now = new Date();

        switch (timeframe) {
            case '7d':
                startDate = new Date(now.setDate(now.getDate() - 7));
                break;
            case '30d':
                startDate = new Date(now.setDate(now.getDate() - 30));
                break;
            case '90d':
                startDate = new Date(now.setDate(now.getDate() - 90));
                break;
            case 'all':
            default:
                startDate = new Date(0);
                break;
        }

        const stats = await GameSessionModel.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(id),
                    completedAt: { $gte: startDate },
                    completed: true
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt" } },
                    avgAccuracy: { $avg: "$accuracy" },
                    avgReactionTime: { $avg: "$timeTaken" },
                    sessionCount: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        return res.status(201).json(stats);

    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}


export const getAllAnalytics = async (req: express.Request, res: express.Response) => {
    try {
        const { timeframe } = req.query;

        let startDate = new Date(0);
        const now = new Date();

        switch (timeframe) {
            case '7d':
                startDate = new Date(now.setDate(now.getDate() - 7));
                break;
            case '30d':
                startDate = new Date(now.setDate(now.getDate() - 30));
                break;
            case '90d':
                startDate = new Date(now.setDate(now.getDate() - 90));
                break;
            case 'all':
            default:
                startDate = new Date(0);
                break;
        }

        const stats = await GameSessionModel.aggregate([
            {
                $match: {
                    completedAt: { $gte: startDate },
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        return res.status(201).json(stats);

    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}