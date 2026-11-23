const { v4: uuidv4 } = require('uuid');
const reservationRepository = require('./reservation.repository');
const compatibilityService = require('../compatibility/compatibility.service');
const db = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');

class ReservationService {
  /**
   * Part-B AI-Assisted Algorithm:
   * ASYNC FUNCTION reserveAndFulfillBloodRequest(dbClient, requestId, bloodBankId, bloodUnitId, requestedQty, staffUser)
   *
   * Enforces:
   * 1. Role must be BLOOD_BANK_STAFF or ADMIN
   * 2. requestedQty > 0
   * 3. Row lock on blood_request with FOR UPDATE
   * 4. Request exists and status is not already 'FULFILLED'
   * 5. Row lock on blood_unit with FOR UPDATE
   * 6. Blood unit exists, expiry_date > CURRENT_DATE (no expired blood)
   * 7. RBC / Plasma compatibility check must pass
   * 8. bloodUnit.quantity >= requestedQty (no negative or zero stock)
   * 9. Deducts requestedQty from blood_unit.quantity
   * 10. Links reservation and updates request status (FULFILLED or PARTIALLY_FULFILLED)
   * 11. Atomic audit log insertion
   * 12. Full rollback if any operation fails
   */
  async reserveAndFulfillBloodRequest(requestId, bloodBankId, bloodUnitId, requestedQty, staffUser) {
    // 1. Authorization check
    if (!staffUser || (staffUser.role !== 'BLOOD_BANK_STAFF' && staffUser.role !== 'ADMIN')) {
      throw new AppError('Unauthorized: Blood Bank Staff or Admin login required', 403, 'UNAUTHORIZED_ROLE');
    }

    // 2. Quantity check
    const qty = parseInt(requestedQty, 10);
    if (isNaN(qty) || qty <= 0) {
      throw new AppError('Invalid requested quantity: must be a positive integer (> 0)', 400, 'INVALID_QUANTITY');
    }

    // Atomic transaction with row-level locks
    return db.withTransaction(async (client) => {
      // 3. Lock blood_request row (SELECT ... FOR UPDATE)
      const reqRes = await client.query(
        'SELECT * FROM blood_request WHERE req_id = $1 FOR UPDATE',
        [requestId]
      );

      if (reqRes.rows.length === 0) {
        throw new AppError(`Blood request '${requestId}' not found`, 404, 'REQUEST_NOT_FOUND');
      }

      const request = reqRes.rows[0];
      if (request.status === 'FULFILLED') {
        throw new AppError('Invalid or already fulfilled request', 400, 'ALREADY_FULFILLED');
      }

      // 4. Lock weak-entity blood_unit row (SELECT ... FOR UPDATE) for (bloodBankId, bloodUnitId)
      const unitRes = await client.query(
        'SELECT * FROM blood_unit WHERE blood_bank_id = $1 AND blood_unit_id = $2 FOR UPDATE',
        [bloodBankId, bloodUnitId]
      );

      if (unitRes.rows.length === 0) {
        throw new AppError(`Blood unit '${bloodUnitId}' not found in blood bank '${bloodBankId}'`, 404, 'UNIT_NOT_FOUND');
      }

      const bloodUnit = unitRes.rows[0];

      // Expiry check: blood_unit.expiry_date must be strictly greater than CURRENT_DATE
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiryDate = new Date(bloodUnit.expiry_date);
      expiryDate.setHours(0, 0, 0, 0);

      if (expiryDate <= today) {
        throw new AppError('Blood unit unavailable or expired. Expired units cannot be allocated.', 400, 'EXPIRED_UNIT');
      }

      // 5. Check RBC / Plasma compatibility
      const isCompatible = compatibilityService.checkCompatibility(
        bloodUnit.blood_group,
        request.blood_group,
        request.component
      );

      if (!isCompatible) {
        throw new AppError(
          `Incompatible blood group: Unit group '${bloodUnit.blood_group}' cannot be allocated to recipient '${request.blood_group}' for component '${request.component}'`,
          400,
          'INCOMPATIBLE_BLOOD_GROUP'
        );
      }

      // 6. Stock check
      if (bloodUnit.quantity < qty) {
        throw new AppError(
          `Insufficient blood stock. Available: ${bloodUnit.quantity}, Requested: ${qty}`,
          400,
          'INSUFFICIENT_STOCK'
        );
      }

      // 7. Deduct requestedQty from blood_unit.quantity
      const newQuantity = bloodUnit.quantity - qty;
      const newUnitStatus = newQuantity === 0 ? 'DISCARDED' : bloodUnit.status;

      await client.query(
        'UPDATE blood_unit SET quantity = $1, status = $2 WHERE blood_bank_id = $3 AND blood_unit_id = $4',
        [newQuantity, newUnitStatus, bloodBankId, bloodUnitId]
      );

      // 8. Calculate new fulfilled quantity & request status
      const totalFulfilled = (request.fulfilled_quantity || 0) + qty;
      const newRequestStatus = totalFulfilled >= request.quantity ? 'FULFILLED' : 'PARTIALLY_FULFILLED';

      await client.query(
        `UPDATE blood_request
         SET blood_bank_id = $1,
             fulfilled_quantity = $2,
             status = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE req_id = $4`,
        [bloodBankId, totalFulfilled, newRequestStatus, requestId]
      );

      // 9. Record reservation
      const resId = `RES-${Date.now().toString().slice(-6)}-${uuidv4().substring(0, 4).toUpperCase()}`;
      await client.query(
        `INSERT INTO reservations (reservation_id, req_id, blood_bank_id, blood_unit_id, reserved_units, status)
         VALUES ($1, $2, $3, $4, $5, 'FULFILLED')`,
        [resId, requestId, bloodBankId, bloodUnitId, qty]
      );

      // 10. Record immutable audit log
      const logId = `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      await client.query(
        `INSERT INTO audit_logs (log_id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          logId,
          staffUser.userId,
          'BLOOD_REQUEST_RESERVED_AND_FULFILLED',
          'RESERVATIONS',
          resId,
          JSON.stringify({
            requestId,
            bloodBankId,
            bloodUnitId,
            requestedQty: qty,
            totalFulfilled,
            requestStatus: newRequestStatus,
            remainingUnitQuantity: newQuantity
          })
        ]
      );

      return {
        success: true,
        message: 'Reservation and fulfillment successful',
        reservation_id: resId,
        request_id: requestId,
        blood_bank_id: bloodBankId,
        blood_unit_id: bloodUnitId,
        allocated_units: qty,
        remaining_unit_stock: newQuantity,
        total_fulfilled: totalFulfilled,
        request_status: newRequestStatus
      };
    });
  }

  async getReservationsByRequest(reqId) {
    return reservationRepository.findByRequestId(reqId);
  }

  async listAllReservations(status) {
    return reservationRepository.listReservations(status);
  }
}

module.exports = new ReservationService();
