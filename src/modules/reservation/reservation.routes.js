const express = require('express');
const router = express.Router();
const controller = require('./reservation.controller');
const { authenticateToken, authorizeRoles } = require('../../middleware/auth');

router.use(authenticateToken);

router.get('/', controller.listAll);
router.get('/request/:request_id', controller.getByRequest);
router.post(
  '/fulfill',
  authorizeRoles('BLOOD_BANK_STAFF', 'ADMIN'),
  controller.reserveAndFulfill
);

module.exports = router;
