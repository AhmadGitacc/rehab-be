import express from 'express';
import { get } from 'lodash';
import mongoose from 'mongoose';
import { UserModel } from '../models/User';
import {
    createNote,
    getNotesForDoctor,
    getUnreadCounts,
    markNotesAsRead
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

        const doctorId = new mongoose.Types.ObjectId(identity._id);
        const { patientId } = req.query;

        const notes = await getNotesForDoctor(
            doctorId,
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

        const doctorId = new mongoose.Types.ObjectId(identity._id);
        const counts = await getUnreadCounts(doctorId);

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
        const doctorId = new mongoose.Types.ObjectId(identity._id);
        const pId = new mongoose.Types.ObjectId(patientId);

        await markNotesAsRead(doctorId, pId);

        return res.status(200).json({ message: 'Notes marked as read' });
    } catch (err) {
        console.error('Mark as read error:', err);
        return res.sendStatus(400);
    }
};
