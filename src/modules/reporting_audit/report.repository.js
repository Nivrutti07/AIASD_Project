const db = require('../../config/database');

class ReportRepository {
  async getDashboardMetrics() {
    const donorCountRes = await db.query('SELECT COUNT(*) as total_donors FROM donor');
    const availableUnitsRes = await db.query(
      "SELECT COALESCE(SUM(quantity), 0) as total_units FROM blood_unit WHERE status = 'AVAILABLE' AND expiry_date >= CURRENT_DATE"
    );
    const pendingReqRes = await db.query(
      "SELECT COUNT(*) as pending_requests FROM blood_request WHERE status IN ('PENDING', 'MATCHED', 'ESCALATED')"
    );
    const criticalReqRes = await db.query(
      "SELECT COUNT(*) as critical_requests FROM blood_request WHERE urgency = 'CRITICAL' AND status != 'FULFILLED'"
    );
    const fulfilledReqRes = await db.query(
      "SELECT COUNT(*) as fulfilled_requests FROM blood_request WHERE status = 'FULFILLED'"
    );
    const activeDrivesRes = await db.query(
      "SELECT COUNT(*) as active_drives FROM donation_drives WHERE status = 'ACTIVE'"
    );

    return {
      total_donors: parseInt(donorCountRes.rows[0].total_donors, 10),
      total_available_blood_units: parseInt(availableUnitsRes.rows[0].total_units, 10),
      pending_requests: parseInt(pendingReqRes.rows[0].pending_requests, 10),
      critical_pending_requests: parseInt(criticalReqRes.rows[0].critical_requests, 10),
      fulfilled_requests: parseInt(fulfilledReqRes.rows[0].fulfilled_requests, 10),
      active_drives: parseInt(activeDrivesRes.rows[0].active_drives, 10)
    };
  }

  async getInventoryReport(startDate = null, endDate = null) {
    const res = await db.query(
      `SELECT u.blood_bank_id, b.name as blood_bank_name, b.city,
              u.blood_unit_id, u.blood_group, u.component, u.quantity,
              u.collection_date, u.expiry_date, u.status,
              (u.expiry_date < CURRENT_DATE) as is_expired
       FROM blood_unit u
       JOIN blood_bank b ON u.blood_bank_id = b.blood_bank_id
       ORDER BY u.blood_bank_id, u.blood_group, u.expiry_date ASC`
    );
    return res.rows;
  }

  async getRequestsReport(startDate = null, endDate = null) {
    let sql = `
      SELECT r.req_id, r.hospital_id, h.name as hospital_name,
             r.blood_bank_id, b.name as blood_bank_name,
             r.blood_group, r.component, r.quantity, r.fulfilled_quantity,
             r.urgency, r.status, r.required_by, r.created_at
      FROM blood_request r
      LEFT JOIN hospital h ON r.hospital_id = h.hospital_id
      LEFT JOIN blood_bank b ON r.blood_bank_id = b.blood_bank_id
    `;
    const params = [];
    const conditions = [];

    if (startDate) {
      params.push(startDate);
      conditions.push(`r.created_at >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate);
      conditions.push(`r.created_at <= $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' ORDER BY r.created_at DESC';
    const res = await db.query(sql, params);
    return res.rows;
  }

  async getAuditLogs(startDate = null, endDate = null, limit = 100) {
    let sql = `
      SELECT log_id, user_id, action, entity_name, entity_id, details, ip_address, created_at
      FROM audit_logs
    `;
    const params = [];
    const conditions = [];

    if (startDate) {
      params.push(startDate);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate);
      conditions.push(`created_at <= $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY created_at DESC LIMIT ${parseInt(limit, 10) || 100}`;
    const res = await db.query(sql, params);
    return res.rows;
  }
}

module.exports = new ReportRepository();
