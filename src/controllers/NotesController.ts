import express from 'express';
import { get } from 'lodash';
import mongoose from 'mongoose';
import { UserModel } from '../models/User';
import {
    createNote,
    getNotesForDoctor,
    getAllNotes,
    getUnreadCounts,
    getAllUnreadCounts,
    markNotesAsRead,
    markAllNotesAsRead
} from '../models/PatientNote';

export const sendNote = async (req: express.Request, res: express.Response) => {
    try {
        const identity = get(req, 'identity') as any;
        if (!identity?._id) {
            return res.status(403).json({ message: 'User not authenticated' });
        }

        const { message } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ message: 'Message is required' });
        }
        if (message.length > 500) {
            return res.status(400).json({ message: 'Message must be 500 characters or less' });
        }

        const patient = await UserModel.findById(identity._id);
        if (!patient || patient.role !== 'patient') {
            return res.status(403).json({ message: 'Only patients can send notes' });
        }
        if (!patient.assignedDoctorId) {
            return res.status(400).json({ message: 'You do not have an assigned doctor' });
        }

        const note = await createNote({
            patientId: patient._id,
            doctorId: patient.assignedDoctorId,
            message: message.trim(),
        });

        return res.status(201).json(note);
    } catch (err) {
        console.error('Send note error:', err);
        return res.sendStatus(400);
    }
};

export const getMyNotes = async (req: express.Request, res: express.Response) => {
    try {
        const identity = get(req, 'identity') as any;
        if (!identity?._id) {
            return res.status(403).json({ message: 'User not authenticated' });
        }

        const { patientId } = req.query;
        const isAdmin = identity.role === 'admin';

        const notes = isAdmin
            ? await getAllNotes(patientId as string | undefined)
            : await getNotesForDoctor(
                new mongoose.Types.ObjectId(identity._id),
                patientId as string | undefined
            );

        return res.status(200).json(notes);
    } catch (err) {
        console.error('Get notes error:', err);
        return res.sendStatus(400);
    }
};

export const getUnreadNoteCounts = async (req: express.Request, res: express.Response) => {
    try {
        const identity = get(req, 'identity') as any;
        if (!identity?._id) {
            return res.status(403).json({ message: 'User not authenticated' });
        }

        const isAdmin = identity.role === 'admin';

        const counts = isAdmin
            ? await getAllUnreadCounts()
            : await getUnreadCounts(new mongoose.Types.ObjectId(identity._id));

        return res.status(200).json(counts);
    } catch (err) {
        console.error('Get unread counts error:', err);
        return res.sendStatus(400);
    }
};

export const markAsRead = async (req: express.Request, res: express.Response) => {
    try {
        const identity = get(req, 'identity') as any;
        if (!identity?._id) {
            return res.status(403).json({ message: 'User not authenticated' });
        }

        const { patientId } = req.params;
        const pId = new mongoose.Types.ObjectId(patientId);
        const isAdmin = identity.role === 'admin';

        if (isAdmin) {
            await markAllNotesAsRead(pId);
        } else {
            const doctorId = new mongoose.Types.ObjectId(identity._id);
            await markNotesAsRead(doctorId, pId);
        }

        return res.status(200).json({ message: 'Notes marked as read' });
    } catch (err) {
        console.error('Mark as read error:', err);
        return res.sendStatus(400);
    }
};
