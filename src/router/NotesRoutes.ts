import { isAuthenticated, isAdmin } from '../middlewares/authentication';
import {
    sendNote,
    getMyNotes,
    getUnreadNoteCounts,
    markAsRead
} from '../controllers/NotesController';
import express from 'express';

export default (router: express.Router) => {
    router.post('/notes/send', isAuthenticated, sendNote);
    router.get('/notes/mine', isAuthenticated, isAdmin, getMyNotes);
    router.get('/notes/unread-counts', isAuthenticated, isAdmin, getUnreadNoteCounts);
    router.patch('/notes/read/:patientId', isAuthenticated, isAdmin, markAsRead);
}
