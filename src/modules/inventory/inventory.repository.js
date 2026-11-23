const db = require('../../config/database');

class InventoryRepository {
  async findUnit(bloodBankId, bloodUnitId) {
    const res = await db.query(
      `SELECT u.blood_bank_id, u.blood_unit_id, u.blood_group, u.component,
              u.quantity, u.collection_date, u.expiry_date, u.status,
              b.name as blood_bank_name, b.city, b.state
       FROM blood_unit u
       JOIN blood_bank b ON u.blood_bank_id = b.blood_bank_id
       WHERE u.blood_bank_id = $1 AND u.blood_unit_id = $2`,
      [bloodBankId, bloodUnitId]
    );
    return res.rows[0] || null;
  }

  async createUnit(unitData) {
    const res = await db.query(
      `INSERT INTO blood_unit (blood_bank_id, blood_unit_id, blood_group, component, quantity, collection_date, expiry_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        unitData.bloodBankId,
        unitData.unitId,
        unitData.bloodGroup,
        unitData.component,
        unitData.quantity,
        unitData.collectionDate,
        unitData.expiryDate,
        unitData.status || 'AVAILABLE'
      ]
    );
    return res.rows[0];
  }

  async updateQuantity(client, bloodBankId, bloodUnitId, newQuantity) {
    const runner = client || db;
    const res = await runner.query(
      `UPDATE blood_unit
       SET quantity = $1, status = CASE WHEN $1 = 0 THEN 'DISCARDED' ELSE status END
       WHERE blood_bank_id = $2 AND blood_unit_id = $3
       RETURNING *`,
      [newQuantity, bloodBankId, bloodUnitId]
    );
    return res.rows[0];
  }

  async listInventory(filters = {}) {
    const conditions = ['1=1'];
    const values = [];
    let idx = 1;

    if (filters.bloodBankId) {
      conditions.push(`u.blood_bank_id = $${idx}`);
      values.push(filters.bloodBankId);
      idx++;
    }

    if (filters.bloodGroup) {
      conditions.push(`u.blood_group = $${idx}`);
      values.push(filters.bloodGroup);
      idx++;
    }

    if (filters.component) {
      conditions.push(`u.component = $${idx}`);
      values.push(filters.component);
      idx++;
    }

    if (filters.status) {
      conditions.push(`u.status = $${idx}`);
      values.push(filters.status);
      idx++;
    }

    const sql = `
      SELECT u.blood_bank_id, u.blood_unit_id, u.blood_group, u.component,
             u.quantity, u.collection_date, u.expiry_date, u.status,
             b.name as blood_bank_name, b.city, b.state,
             (u.expiry_date < CURRENT_DATE) as is_expired
      FROM blood_unit u
      JOIN blood_bank b ON u.blood_bank_id = b.blood_bank_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY u.expiry_date ASC
    `;

    const res = await db.query(sql, values);
    return res.rows;
  }

  async getAggregatedStock(bloodBankId = null) {
    let whereClause = "WHERE u.status = 'AVAILABLE' AND u.expiry_date >= CURRENT_DATE";
    const values = [];

    if (bloodBankId) {
      whereClause += ' AND u.blood_bank_id = $1';
      values.push(bloodBankId);
    }

    const sql = `
      SELECT u.blood_group, u.component, SUM(u.quantity) as total_units
      FROM blood_unit u
      ${whereClause}
      GROUP BY u.blood_group, u.component
      ORDER BY u.blood_group, u.component
    `;

    const res = await db.query(sql, values);
    return res.rows;
  }
}

module.exports = new InventoryRepository();
