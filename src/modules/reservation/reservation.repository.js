const db = require('../../config/database');

class ReservationRepository {
  async createReservation(client, reservationData) {
    const runner = client || db;
    const res = await runner.query(
      `INSERT INTO reservations (reservation_id, req_id, blood_bank_id, blood_unit_id, reserved_units, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       RETURNING *`,
      [
        reservationData.reservationId,
        reservationData.reqId,
        reservationData.bloodBankId,
        reservationData.bloodUnitId,
        reservationData.reservedUnits
      ]
    );
    return res.rows[0];
  }

  async findByRequestId(reqId) {
    const res = await db.query(
      `SELECT r.reservation_id, r.req_id, r.blood_bank_id, r.blood_unit_id,
              r.reserved_units, r.reserved_at, r.status,
              u.blood_group, u.component, b.name as blood_bank_name
       FROM reservations r
       JOIN blood_unit u ON r.blood_bank_id = u.blood_bank_id AND r.blood_unit_id = u.blood_unit_id
       JOIN blood_bank b ON r.blood_bank_id = b.blood_bank_id
       WHERE r.req_id = $1`,
      [reqId]
    );
    return res.rows;
  }

  async listReservations(status = null) {
    let sql = `
      SELECT r.reservation_id, r.req_id, r.blood_bank_id, r.blood_unit_id,
             r.reserved_units, r.reserved_at, r.status,
             req.blood_group as requested_group, req.urgency,
             u.blood_group as unit_group, u.component, b.name as blood_bank_name
      FROM reservations r
      JOIN blood_request req ON r.req_id = req.req_id
      JOIN blood_unit u ON r.blood_bank_id = u.blood_bank_id AND r.blood_unit_id = u.blood_unit_id
      JOIN blood_bank b ON r.blood_bank_id = b.blood_bank_id
    `;
    const params = [];

    if (status) {
      sql += ' WHERE r.status = $1';
      params.push(status);
    }

    sql += ' ORDER BY r.reserved_at DESC';
    const res = await db.query(sql, params);
    return res.rows;
  }
}

module.exports = new ReservationRepository();
