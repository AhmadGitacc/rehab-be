import express from 'express';
import { get } from 'lodash';
import mongoose from 'mongoose';
import { UserModel } from '../models/User';
import { GameSessionModel } from '../models/GameSession';

const startOfDayUTC = (date: Date) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const formatDayUTC = (date: Date) => {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const getLinkedPatientIds = (identity: any): string[] =>
    (identity?.linkedPatientIds || []).map((id: any) => id.toString());

/**
 * Returns the requested patient id only when it belongs to the caregiver's
 * linked patients. Defaults to the first linked patient when no id is given.
 * Returns null (-> 403) when the patient is not linked.
 */
const resolvePatientId = (identity: any, patientId: unknown): string | null => {
    const linked = getLinkedPatientIds(identity);
    if (linked.length === 0) return null;

    if (!patientId) return linked[0];

    const requested = String(patientId);
    return linked.includes(requested) ? requested : null;
};

/**
 * Lists the patients linked to the authenticated caregiver.
 */
export const getCaregiverPatients = async (req: express.Request, res: express.Response) => {
    try {
        const identity = get(req, 'identity') as any;
        const linked = getLinkedPatientIds(identity);

        const patients = await UserModel.find({ _id: { $in: linked } })
            .sort({ username: 1 });

        return res.status(200).json(patients);
    } catch (err) {
        console.log(err);
        return res.sendStatus(400);
    }
};

/**
 * Aggregated summary of the linked patient's activity for the current UTC day,
 * including a consecutive-day streak.
 */
export const getDailySummary = async (req: express.Request, res: express.Response) => {
    try {
        const identity = get(req, 'identity') as any;
        const patientId = resolvePatientId(identity, req.query.patientId);

        if (!patientId) {
            return res.status(403).json({ message: 'Patient is not linked to this caregiver' });
        }

        const userId = new mongoose.Types.ObjectId(patientId);
        const now = new Date();
        const todayStart = startOfDayUTC(now);
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

        const todayStats = await GameSessionModel.aggregate([
            { $match: { userId, completed: true, completedAt: { $gte: todayStart, $lt: todayEnd } } },
            { $group: { _id: '$title', count: { $sum: 1 }, avgAccuracy: { $avg: '$accuracy' } } }
        ]);

        const byTitle: Record<string, number> = {};
        let sessionsCompleted = 0;
        let weightedAccuracy = 0;

        todayStats.forEach((s: any) => {
            byTitle[s._id] = s.count;
            sessionsCompleted += s.count;
            weightedAccuracy += (s.avgAccuracy || 0) * s.count;
        });

        const streakSince = startOfDayUTC(now);
        streakSince.setUTCDate(streakSince.getUTCDate() - 60);

        const activeDays = await GameSessionModel.aggregate([
            { $match: { userId, completed: true, completedAt: { $gte: streakSince } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt', timezone: 'UTC' } } } }
        ]);

        const daySet = new Set(activeDays.map((d: any) => d._id));
        const cursor = new Date(todayStart);
        if (!daySet.has(formatDayUTC(cursor))) {
            cursor.setUTCDate(cursor.getUTCDate() - 1);
        }

        let streak = 0;
        while (daySet.has(formatDayUTC(cursor))) {
            streak += 1;
            cursor.setUTCDate(cursor.getUTCDate() - 1);
        }

        return res.status(200).json({
            date: formatDayUTC(todayStart),
            sessionsCompleted,
            distinctGames: todayStats.length,
            avgAccuracy: sessionsCompleted ? Math.round(weightedAccuracy / sessionsCompleted) : 0,
            byTitle,
            streak
        });
    } catch (err) {
        console.log(err);
        return res.sendStatus(400);
    }
};

/**
 * 7-day rolling progress for the linked patient: zero-filled daily buckets,
 * per-title averages, and the most recent sessions.
 */
export const getWeeklyProgress = async (req: express.Request, res: express.Response) => {
    try {
        const identity = get(req, 'identity') as any;
        const patientId = resolvePatientId(identity, req.query.patientId);

        if (!patientId) {
            return res.status(403).json({ message: 'Patient is not linked to this caregiver' });
        }

        const userId = new mongoose.Types.ObjectId(patientId);
        const start = startOfDayUTC(new Date());
        start.setUTCDate(start.getUTCDate() - 6);

        const dailyStats = await GameSessionModel.aggregate([
            { $match: { userId, completed: true, completedAt: { $gte: start } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt', timezone: 'UTC' } },
                    count: { $sum: 1 },
                    avgAccuracy: { $avg: '$accuracy' }
                }
            }
        ]);

        const dayMap = new Map(dailyStats.map((d: any) => [d._id, d]));
        const daily: Array<{ date: string; count: number; avgAccuracy: number }> = [];

        for (let i = 0; i < 7; i++) {
            const day = new Date(start);
            day.setUTCDate(start.getUTCDate() + i);
            const key = formatDayUTC(day);
            const entry: any = dayMap.get(key);
            daily.push({
                date: key,
                count: entry?.count || 0,
                avgAccuracy: entry ? Math.round(entry.avgAccuracy) : 0
            });
        }

        const titleRaw = await GameSessionModel.aggregate([
            { $match: { userId, completed: true, completedAt: { $gte: start } } },
            { $group: { _id: '$title', avgAccuracy: { $avg: '$accuracy' }, count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const titleStats = titleRaw.map((t: any) => ({
            title: t._id,
            avgAccuracy: Math.round(t.avgAccuracy || 0),
            count: t.count
        }));

        const recentRaw = await GameSessionModel.find({ userId, completed: true })
            .sort({ completedAt: -1 })
            .limit(5)
            .select('title accuracy score difficulty completedAt');

        const recentSessions = recentRaw.map((s: any) => ({
            title: s.title,
            accuracy: s.accuracy,
            score: s.score,
            difficulty: s.difficulty,
            completedAt: s.completedAt
        }));

        return res.status(200).json({ daily, titleStats, recentSessions });
    } catch (err) {
        console.log(err);
        return res.sendStatus(400);
    }
};

/**
 * Read-only care plan (assigned categories + daily goal) for the linked patient.
 */
export const getPatientCarePlan = async (req: express.Request, res: express.Response) => {
    try {
        const identity = get(req, 'identity') as any;
        const patientId = resolvePatientId(identity, req.query.patientId);

        if (!patientId) {
            return res.status(403).json({ message: 'Patient is not linked to this caregiver' });
        }

        const patient = await UserModel.findById(patientId).select('assignedCategories dailyGoal');

        return res.status(200).json({
            assignedCategories: patient?.assignedCategories || [],
            dailyGoal: patient?.dailyGoal ?? 10
        });
    } catch (err) {
        console.log(err);
        return res.sendStatus(400);
    }
};

/**
 * Link a caregiver to a patient using the patient's share code.
 */
export const linkCaregiverWithCode = async (req: express.Request, res: express.Response) => {
    try {
        const identity = get(req, 'identity') as any;
        const { code } = req.body;

        if (!code || typeof code !== 'string') {
            return res.status(400).json({ message: 'Share code is required' });
        }

        if (!identity?._id) {
            return res.status(403).json({ message: 'User not authenticated' });
        }

        if (identity.role !== 'caregiver') {
            return res.status(403).json({ message: 'Only caregivers can link with a code' });
        }

        const caregiver = await UserModel.findById(identity._id);
        if (!caregiver) {
            return res.status(404).json({ message: 'Caregiver not found' });
        }

        const normalizedCode = code.trim().toUpperCase();
        const patient = await UserModel.findOne({ role: 'patient', careLinkCode: normalizedCode });

        if (!patient) {
            return res.status(404).json({ message: 'Invalid share code' });
        }

        const alreadyLinked = (caregiver.linkedPatientIds || []).some(
            (id: any) => id.toString() === patient._id.toString()
        );

        if (alreadyLinked) {
            return res.status(400).json({ message: 'Patient already linked' });
        }

        caregiver.linkedPatientIds = [...(caregiver.linkedPatientIds || []), patient._id];
        await caregiver.save();

        return res.status(200).json(patient);
    } catch (err) {
        console.log(err);
        return res.sendStatus(400);
    }
};
