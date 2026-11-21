import { isAuthenticated } from '../middlewares/authentication';
import {
    ForgotPassword,
    Login,
    Logout,
    Me,
    Refresh,
    Register,
    Resend2fa,
    ResendVerification,
    ResetPassword,
    ValidateResetToken,
    Verify2fa,
    VerifyEmail,
} from '../controllers/AuthController';
import express from 'express';

export default (router: express.Router) => {
    router.post('/auth/register', Register);
    router.post('/auth/verify-email', VerifyEmail);
    router.post('/auth/resend-verification', ResendVerification);
    router.post('/auth/login', Login);
    router.post('/auth/verify-2fa', Verify2fa);
    router.post('/auth/resend-2fa', Resend2fa);
    router.post('/auth/refresh', Refresh);
    router.get('/auth/me', isAuthenticated, Me);
    router.post('/auth/logout', Logout);
    router.post('/auth/forgot-password', ForgotPassword);
    router.post('/auth/validate-reset-token', ValidateResetToken);
    router.post('/auth/reset-password', ResetPassword);
};
