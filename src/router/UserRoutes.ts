import { isAdmin, isAuthenticated, isOwner } from '../middlewares/authentication';
import { deleteUser, getAllUsers, getUser, updateUser } from '../controllers/UsersController';
import express from 'express';

export default (router: express.Router) => {
    router.get('/users', isAuthenticated, isAdmin, getAllUsers)
    router.get('/users/:id', isAdmin, isOwner, getUser)
    router.patch('/users/update/:id', isAuthenticated, isOwner, updateUser)
    router.delete('/users/delete/:id', isAuthenticated, isOwner, deleteUser)
}