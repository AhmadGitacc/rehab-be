import express from 'express';
import { get } from 'lodash';
import { GameSessionModel } from '../models/GameSession';
import { UserModel } from '../models/User';
import mongoose from 'mongoose';

const getStartDate = (timeframe: string) => {
    const date = new Date();
    switch (timeframe) {
        case '7d': date.setDate(date.getDate() - 7); break;
        case '30d': date.setDate(date.getDate() - 30); break;
        case '90d': date.setDate(date.getDate() - 90); break;
        default: return new Date(0);
    }
    return date;
};

export const getAnalytics = async (req: express.Request, res: express.Response) => {
    try {
        const { id } = req.params;
        const { timeframe = '7d' } = req.query;
        const startDate = getStartDate(timeframe as string);

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
                    _id: {
                        date: { $dateToString: { format: "%m-%d", date: "$completedAt" } },
                        title: "$title"
                    },
                    avgAccuracy: { $avg: "$accuracy" },
                    avgValue: { $avg: "$timeTaken" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id.date": 1 } }
        ]);

        return res.status(200).json(stats);
    } catch (err) {
        return res.sendStatus(400);
    }
}

export const getAllAnalytics = async (req: express.Request, res: express.Response) => {
    try {
        const identity = get(req, 'identity') as any;
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

        const matchStage: Record<string, any> = {
            completedAt: { $gte: startDate },
        };

        // Doctors can only see sessions of their assigned patients
        if (identity?.role === 'doctor') {
            const assignedPatients = await UserModel.find({
                assignedDoctorId: identity._id,
                role: 'patient'
            }).select('_id');

            const patientIds = assignedPatients.map((p) => p._id);
            matchStage.userId = { $in: patientIds };
        }

        const stats = await GameSessionModel.aggregate([
            { $match: matchStage },
            { $sort: { "_id": 1 } }
        ]);

        return res.status(201).json(stats);

    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}
