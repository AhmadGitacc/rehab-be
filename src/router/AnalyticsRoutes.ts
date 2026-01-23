import { getAllAnalytics, getAnalytics } from '../controllers/AnalyticsController';
import express from 'express';
import { isAdmin, isAuthenticated, isOwner } from '../middlewares/authentication';

export default (router: express.Router) => {
    router.get('/analytics/:id', isAuthenticated, isOwner, getAnalytics)
    router.get('/analytics', isAuthenticated, isAdmin, getAllAnalytics)
}