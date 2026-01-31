import express from 'express';
import { authentication, random } from '../helpers';
import { deleteUserById, getUserById, getUsers } from '../models/User';

export const getAllUsers = async (req: express.Request, res: express.Response) => {
    try {
        const users = await getUsers()

        return res.status(200).json(users);
    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}

export const getUser = async (req: express.Request, res: express.Response) => {
    try {
        const { id } = req.params;
        const user = await getUserById(id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}

export const updateUser = async (req: express.Request, res: express.Response) => {
    try {
        const { id } = req.params
        const { email, username, role, password } = req.body

        const user = await getUserById(id)

        if (!user) {
            return res.status(400).json("user doesn't exist")
        }
        const salt = random()

        if (email) user.email = email
        if (username) user.username = username
        if (role) user.role = role
        if (password) {
            user.authentication.salt = salt;
            user.authentication.password = authentication(salt, password);
        }

        await user.save()
        return res.status(200).json(user)

    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}

export const deleteUser = async (req: express.Request, res: express.Response) => {
    try{
        const { id } = req.params

        const user = await deleteUserById(id)

        return res.json(user)

    }catch(err){
        console.log(err)
        return res.sendStatus(400)
    }
}