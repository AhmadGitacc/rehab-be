import { isAuthenticated } from '../middlewares/authentication';
import { Login, Logout, Register } from '../controllers/AuthController';
import express from 'express';

export default (router: express.Router)=>{
    router.post('/auth/register', Register)
    router.post('/auth/login', Login)
    router.post('/auth/logout', isAuthenticated, Logout)
}
