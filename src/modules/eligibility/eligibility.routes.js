const express = require('express');
const router = express.Router();
const controller = require('./eligibility.controller');
const { authenticateToken } = require('../../middleware/auth');

router.get('/rules', controller.getActiveRules);
router.post('/evaluate', controller.evaluateCustomDonor);
router.get('/:donor_id', authenticateToken, controller.getDonorEligibility);

module.exports = router;
