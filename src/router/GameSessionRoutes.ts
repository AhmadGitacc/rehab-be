import { isAuthenticated } from '../middlewares/authentication';
import { saveSessionInfo } from '../controllers/GameController';
import express from 'express';

export default (router: express.Router) => {
    router.post('/game-session/save', isAuthenticated, saveSessionInfo)
}