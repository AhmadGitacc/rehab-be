import express from 'express';
import { get } from 'lodash';
import { authentication, random } from '../helpers';
import { deleteUserById, getUserById, getUsers, UserModel } from '../models/User';

const CATEGORIES = ['memory', 'coordination', 'reaction', 'auditory'];

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

/**
 * Returns all patients, optionally enriched with their assigned doctor and
 * enabled cognitive training categories. Used by the admin assignment page
 * and the doctor care-plan page.
 */
export const getPatientsForAssignment = async (req: express.Request, res: express.Response) => {
    try {
        const patients = await UserModel.find({ role: 'patient' })
            .select('-authentication')
            .populate('assignedDoctorId', '_id username email')
            .sort({ username: 1 })

        return res.status(200).json(patients);
    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}

/**
 * Assigns a doctor (or clears the assignment) for a single patient.
 */
export const assignDoctor = async (req: express.Request, res: express.Response) => {
    try {
        const { id } = req.params
        const { doctorId } = req.body

        if (doctorId === undefined || doctorId === null || doctorId === '') {
            // Unassign
            const cleared = await UserModel.findByIdAndUpdate(id, { $set: { assignedDoctorId: null } }, { new: true })
            return res.status(200).json(cleared)
        }

        const user = await getUserById(id)
        if (!user) {
            return res.status(400).json("user doesn't exist")
        }
        if (user.role !== 'patient') {
            return res.status(400).json("Only patients can be assigned a doctor")
        }

        const doctor = await UserModel.findById(doctorId)
        if (!doctor || doctor.role !== 'doctor') {
            return res.status(400).json("Invalid doctor")
        }

        user.assignedDoctorId = doctor._id
        await user.save()
        return res.status(200).json(user)

    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}

/**
 * Sets the enabled cognitive training categories for a patient.
 */
export const assignCategories = async (req: express.Request, res: express.Response) => {
    try {
        const { id } = req.params
        const { categories } = req.body

        if (!Array.isArray(categories)) {
            return res.status(400).json("categories must be an array")
        }

        const user = await getUserById(id)
        if (!user) {
            return res.status(400).json("user doesn't exist")
        }
        if (user.role !== 'patient') {
            return res.status(400).json("Only patients can have categories assigned")
        }

        const normalized = [...new Set(categories.filter((c) => CATEGORIES.includes(c)))];
        user.assignedCategories = normalized
        await user.save()
        return res.status(200).json(user)

    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}

/**
 * Returns the enabled categories for the currently authenticated user so the
 * patient dashboard can filter the activity catalog.
 */
export const getMyCategories = async (req: express.Request, res: express.Response) => {
    try {
        const identity = get(req, 'identity') as any;
        if (!identity?._id) {
            return res.status(403).json({ message: 'User not authenticated' });
        }

        const user = await UserModel.findById(identity._id)
        return res.status(200).json({ assignedCategories: user?.assignedCategories || [] });

    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}

/**
 * Sets the daily goal for a patient.
 */
export const setDailyGoal = async (req: express.Request, res: express.Response) => {
    try {
        const { id } = req.params;
        const { goal } = req.body;

        if (typeof goal !== 'number' || goal < 1 || goal > 50 || !Number.isInteger(goal)) {
            return res.status(400).json("Goal must be an integer between 1 and 50");
        }

        const user = await getUserById(id);
        if (!user) {
            return res.status(400).json("user doesn't exist");
        }
        if (user.role !== 'patient') {
            return res.status(400).json("Only patients can have a daily goal");
        }

        user.dailyGoal = goal;
        await user.save();
        return res.status(200).json(user);

    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}

/**
 * Returns the daily goal for the currently authenticated user.
 */
export const getMyGoal = async (req: express.Request, res: express.Response) => {
    try {
        const identity = get(req, 'identity') as any;
        if (!identity?._id) {
            return res.status(403).json({ message: 'User not authenticated' });
        }

        const user = await UserModel.findById(identity._id);
        return res.status(200).json({ dailyGoal: user?.dailyGoal || 10 });

    } catch (err) {
        console.log(err)
        return res.sendStatus(400)
    }
}