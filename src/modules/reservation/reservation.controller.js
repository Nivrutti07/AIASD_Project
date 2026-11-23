const reservationService = require('./reservation.service');

class ReservationController {
  async reserveAndFulfill(req, res, next) {
    try {
      const { request_id, blood_bank_id, blood_unit_id, requested_units } = req.body;
      const bankId = blood_bank_id || req.user.userId;
      const result = await reservationService.reserveAndFulfillBloodRequest(
        request_id,
        bankId,
        blood_unit_id,
        requested_units,
        req.user
      );
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async getByRequest(req, res, next) {
    try {
      const { request_id } = req.params;
      const reservations = await reservationService.getReservationsByRequest(request_id);
      return res.status(200).json({
        success: true,
        data: reservations
      });
    } catch (err) {
      next(err);
    }
  }

  async listAll(req, res, next) {
    try {
      const { status } = req.query;
      const reservations = await reservationService.listAllReservations(status);
      return res.status(200).json({
        success: true,
        data: reservations
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ReservationController();
