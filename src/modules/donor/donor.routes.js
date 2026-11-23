const express = require('express');
const router = express.Router();
const controller = require('./donor.controller');
const { authenticateToken } = require('../../middleware/auth');

router.use(authenticateToken);

router.get('/', controller.listDonors);
router.get('/:donor_id', controller.getDonor);
router.put('/:donor_id', controller.updateDonor);

module.exports = router;
