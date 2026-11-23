const express = require('express');
const router = express.Router();
const controller = require('./inventory.controller');
const { authenticateToken, authorizeRoles } = require('../../middleware/auth');

router.use(authenticateToken);

router.get('/', controller.listInventory);
router.get('/:blood_bank_id/units/:unit_id', controller.checkStatus);
router.post(
  '/:blood_bank_id/units',
  authorizeRoles('BLOOD_BANK_STAFF', 'ADMIN'),
  controller.trackUnit
);
router.post(
  '/transfer',
  authorizeRoles('BLOOD_BANK_STAFF', 'ADMIN'),
  controller.transferStock
);

module.exports = router;
