import express from 'express';
import { createUser, getUserByEmail } from '../models/User';
import { authentication, random } from '../helpers';

export const Register = async (req: express.Request, res: express.Response) => {
    try {
        const { email, username, password } = req.body;

        if (!email || !username || !password) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ message: 'Email already in use' });
        }

        const salt = random()

        const newUser = await createUser({
            email,
            username,
            role: 'patient',
            authentication: {
                salt,
                password: authentication(salt, password)
            },
        })

        return res.status(200).json(newUser);
    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}

export const Login = async (req: express.Request, res: express.Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const user = await getUserByEmail(email).select('+authentication.password +authentication.salt');

        if (!user) {
            return res.status(400).json({ message: 'User does not exist' });
        }

        const expectedHash = authentication(user.authentication.salt, password)

        if (user.authentication.password != expectedHash) {
            return res.status(403).json({ message: 'Invalid password' });
        }

        const salt = random()
        user.authentication.sessionToken = authentication(salt, user._id.toString())

        await user.save()
        res.cookie("REHAB-AUTH", user.authentication.sessionToken, { domain: "localhost", path: "/" })

        return res.status(200).json(user).end()

    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}

export const Logout = async (req: express.Request, res: express.Response) => {
    try{
        res.clearCookie("REHAB-AUTH", { domain: "localhost", path: "/" })

        return res.status(200).json({ message: 'Logged out successfully' })
    } catch(err){
        console.log(err)
        return res.sendStatus(400)
    }
}