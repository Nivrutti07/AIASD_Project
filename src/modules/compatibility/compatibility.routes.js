const express = require('express');
const router = express.Router();
const controller = require('./compatibility.controller');

router.post('/check', controller.check);
router.get('/compatible-groups', controller.getCompatibleDonors);
router.get('/matrices', controller.getMatrices);

module.exports = router;
