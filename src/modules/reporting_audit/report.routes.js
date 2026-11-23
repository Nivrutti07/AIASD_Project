const express = require('express');
const router = express.Router();
const controller = require('./report.controller');
const { authenticateToken, authorizeRoles } = require('../../middleware/auth');

router.use(authenticateToken);

router.get('/dashboard', controller.getDashboard);
router.get(
  '/:report_type',
  authorizeRoles('BLOOD_BANK_STAFF', 'ADMIN', 'HOSPITAL'),
  controller.getReport
);

module.exports = router;
