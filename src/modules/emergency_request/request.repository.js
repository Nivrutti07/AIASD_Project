const db = require('../../config/database');

class RequestRepository {
  async findById(reqId) {
    const res = await db.query(
      `SELECT r.req_id, r.hospital_id, r.patient_id, r.blood_bank_id,
              r.blood_group, r.component, r.quantity, r.fulfilled_quantity,
              r.urgency, r.status, r.required_by, r.created_at, r.updated_at,
              h.name as hospital_name, p.name as patient_name, b.name as blood_bank_name
       FROM blood_request r
       LEFT JOIN hospital h ON r.hospital_id = h.hospital_id
       LEFT JOIN patient p ON r.patient_id = p.patient_id
       LEFT JOIN blood_bank b ON r.blood_bank_id = b.blood_bank_id
       WHERE r.req_id = $1`,
      [reqId]
    );
    return res.rows[0] || null;
  }

  async create(reqData) {
    const res = await db.query(
      `INSERT INTO blood_request (
        req_id, hospital_id, patient_id, blood_bank_id, blood_group,
        component, quantity, fulfilled_quantity, urgency, status, required_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, 'PENDING', $9)
      RETURNING *`,
      [
        reqData.reqId,
        reqData.hospitalId || null,
        reqData.patientId || null,
        reqData.bloodBankId || null,
        reqData.bloodGroup,
        reqData.component,
        reqData.quantity,
        reqData.urgency,
        reqData.requiredBy
      ]
    );
    return res.rows[0];
  }

  async updateStatus(client, reqId, status, fulfilledQuantity = null) {
    const runner = client || db;
    let sql = 'UPDATE blood_request SET status = $1, updated_at = CURRENT_TIMESTAMP';
    const params = [status, reqId];

    if (fulfilledQuantity !== null) {
      sql += ', fulfilled_quantity = $3 WHERE req_id = $2 RETURNING *';
      params.splice(2, 0, fulfilledQuantity);
    } else {
      sql += ' WHERE req_id = $2 RETURNING *';
    }

    const res = await runner.query(sql, params);
    return res.rows[0];
  }

  async listRequests(filters = {}) {
    const conditions = ['1=1'];
    const values = [];
    let idx = 1;

    if (filters.status) {
      conditions.push(`r.status = $${idx}`);
      values.push(filters.status);
      idx++;
    }

    if (filters.urgency) {
      conditions.push(`r.urgency = $${idx}`);
      values.push(filters.urgency);
      idx++;
    }

    if (filters.hospitalId) {
      conditions.push(`r.hospital_id = $${idx}`);
      values.push(filters.hospitalId);
      idx++;
    }

    if (filters.bloodGroup) {
      conditions.push(`r.blood_group = $${idx}`);
      values.push(filters.bloodGroup);
      idx++;
    }

    const sql = `
      SELECT r.req_id, r.hospital_id, r.patient_id, r.blood_bank_id,
             r.blood_group, r.component, r.quantity, r.fulfilled_quantity,
             r.urgency, r.status, r.required_by, r.created_at, r.updated_at,
             h.name as hospital_name, p.name as patient_name, b.name as blood_bank_name
      FROM blood_request r
      LEFT JOIN hospital h ON r.hospital_id = h.hospital_id
      LEFT JOIN patient p ON r.patient_id = p.patient_id
      LEFT JOIN blood_bank b ON r.blood_bank_id = b.blood_bank_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY 
        CASE r.urgency 
          WHEN 'CRITICAL' THEN 1 
          WHEN 'URGENT' THEN 2 
          WHEN 'NORMAL' THEN 3 
        END,
        r.required_by ASC
    `;

    const res = await db.query(sql, values);
    return res.rows;
  }
}

module.exports = new RequestRepository();
