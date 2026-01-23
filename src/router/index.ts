import express from 'express';
import AuthRoute from './AuthRoute';
import UserRoutes from './UserRoutes';
import SessionRoutes from './GameSessionRoutes';
import AnalyticsRoutes from './AnalyticsRoutes';

const router = express.Router()

export default (): express.Router => {
    AuthRoute(router);
    UserRoutes(router);
    SessionRoutes(router);
    AnalyticsRoutes(router);

    return router;
}