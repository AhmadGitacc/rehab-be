import { isAdmin, isSuperAdmin, isAuthenticated, isOwner } from '../middlewares/authentication';
import {
    deleteUser,
    getAllUsers,
    getUser,
    updateUser,
    getPatientsForAssignment,
    assignDoctor,
    assignCategories,
    getMyCategories
} from '../controllers/UsersController';
import express from 'express';

export default (router: express.Router) => {
    router.get('/users', isAuthenticated, isAdmin, getAllUsers)
    router.get('/users/patients', isAuthenticated, isAdmin, getPatientsForAssignment)
    router.get('/users/me/categories', isAuthenticated, getMyCategories)
    router.get('/users/:id', isAdmin, isOwner, getUser)
    router.patch('/users/update/:id', isAuthenticated, isSuperAdmin, updateUser)
    router.delete('/users/delete/:id', isAuthenticated, isSuperAdmin, deleteUser)
    router.put('/users/assign-doctor/:id', isAuthenticated, isSuperAdmin, assignDoctor)
    router.put('/users/categories/:id', isAuthenticated, isAdmin, assignCategories)
}