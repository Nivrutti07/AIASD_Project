const driveService = require('./drive.service');

class DriveController {
  async createDrive(req, res, next) {
    try {
      const created = await driveService.createDrive(req.body, req.user);
      return res.status(201).json({
        success: true,
        message: 'Donation drive created successfully',
        data: created
      });
    } catch (err) {
      next(err);
    }
  }

  async listDrives(req, res, next) {
    try {
      const { status, blood_bank_id } = req.query;
      const drives = await driveService.listDrives({
        status,
        bloodBankId: blood_bank_id
      });
      return res.status(200).json({
        success: true,
        data: drives
      });
    } catch (err) {
      next(err);
    }
  }

  async getDrive(req, res, next) {
    try {
      const { drive_id } = req.params;
      const drive = await driveService.getDrive(drive_id);
      return res.status(200).json({
        success: true,
        data: drive
      });
    } catch (err) {
      next(err);
    }
  }

  async bookSlot(req, res, next) {
    try {
      const result = await driveService.bookDonationSlot(req.body, req.user);
      return res.status(201).json({
        success: true,
        message: 'Donation slot booked successfully',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async cancelBooking(req, res, next) {
    try {
      const { booking_id } = req.params;
      const result = await driveService.cancelBooking(booking_id, req.user);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async getMyBookings(req, res, next) {
    try {
      const bookings = await driveService.getMyBookings(req.user.userId);
      return res.status(200).json({
        success: true,
        data: bookings
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DriveController();
