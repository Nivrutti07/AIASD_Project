const express = require('express');
const router = express.Router();
const controller = require('./drive.controller');
const { authenticateToken, authorizeRoles } = require('../../middleware/auth');

router.use(authenticateToken);

router.get('/', controller.listDrives);
router.post(
  '/',
  authorizeRoles('BLOOD_BANK_STAFF', 'ADMIN'),
  controller.createDrive
);
router.get('/my-bookings', authorizeRoles('DONOR'), controller.getMyBookings);
router.get('/:drive_id', controller.getDrive);
router.post('/book', authorizeRoles('DONOR', 'BLOOD_BANK_STAFF', 'ADMIN'), controller.bookSlot);
router.post('/cancel-booking/:booking_id', controller.cancelBooking);

module.exports = router;
