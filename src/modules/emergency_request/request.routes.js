const express = require('express');
const router = express.Router();
const controller = require('./request.controller');
const { authenticateToken, authorizeRoles } = require('../../middleware/auth');

router.use(authenticateToken);

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:request_id', controller.getById);
router.patch(
  '/:request_id/status',
  authorizeRoles('BLOOD_BANK_STAFF', 'ADMIN', 'HOSPITAL'),
  controller.updateStatus
);
router.get('/:request_id/donors', controller.rankDonors);
router.post(
  '/:request_id/escalate',
  authorizeRoles('HOSPITAL', 'BLOOD_BANK_STAFF', 'ADMIN'),
  controller.escalate
);

module.exports = router;
