import { isAuthenticated, isCaregiver } from '../middlewares/authentication';
import {
    getCaregiverPatients,
    getDailySummary,
    getWeeklyProgress,
    getPatientCarePlan,
    linkCaregiverWithCode
} from '../controllers/CaregiverController';
import express from 'express';

export default (router: express.Router) => {
    router.get('/caregiver/patients', isAuthenticated, isCaregiver, getCaregiverPatients)
    router.get('/caregiver/daily-summary', isAuthenticated, isCaregiver, getDailySummary)
    router.get('/caregiver/weekly-progress', isAuthenticated, isCaregiver, getWeeklyProgress)
    router.get('/caregiver/care-plan', isAuthenticated, isCaregiver, getPatientCarePlan)
    router.post('/caregiver/link-with-code', isAuthenticated, isCaregiver, linkCaregiverWithCode)
}
