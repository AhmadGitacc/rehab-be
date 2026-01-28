import express from "express";
import { get, merge } from "lodash";
import { getUserBySessionToken } from "../models/User";

export const isAuthenticated = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        let sessionToken = req.cookies["REHAB-AUTH"]

        if (!sessionToken && req.headers.authorization) {
            sessionToken = req.headers.authorization.split(' ')[1];
        }

        if (!sessionToken) {
            return res.sendStatus(403)
        }

        const existingUser = await getUserBySessionToken(sessionToken)

        if (!existingUser) {
            return res.sendStatus(403)
        }

        merge(req, { identity: existingUser })

        return next()

    } catch (err) {
        console.log(err)
        return res.status(400).json("You are not authenticated")
    }
}

export const isOwner = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        const { id } = req.params

        const currentUserId = get(req, 'identity._id') as string;
        const currentUserRole = get(req, 'identity.role') as string;

        if (!currentUserId) {
            return res.sendStatus(403)
        }

        if (currentUserRole === 'admin' || currentUserRole === 'doctor') {
            return next();
        }

        if (currentUserId.toString() != id) {
            return res.sendStatus(403)
        }

        next()

    } catch (err) {
        console.log(err)
        return res.status(400).json(err)

    }
}

export const isAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        const currentUser = get(req, 'identity.role') as string;

        if (currentUser !== 'admin' && currentUser !== 'doctor') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        return next();

    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}