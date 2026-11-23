const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');
const { authenticateToken } = require('../../middleware/auth');

router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', authenticateToken, controller.getMe);

module.exports = router;
