const db = require('../../config/database');

class DonorRepository {
  async findById(donorId) {
    const res = await db.query(
      `SELECT d.donor_id, d.name, d.blood_group, d.age, d.weight, d.city, d.state,
              d.last_donation_date, d.deferral_until, d.medical_history,
              d.total_donations, d.response_rate, d.is_available,
              u.email, u.phone, u.created_at
       FROM donor d
       JOIN users u ON d.donor_id = u.user_id
       WHERE d.donor_id = $1`,
      [donorId]
    );
    return res.rows[0] || null;
  }

  async updateProfile(donorId, updateFields) {
    const setClauses = [];
    const values = [];
    let idx = 1;

    const allowedFields = [
      'name', 'age', 'weight', 'city', 'state',
      'last_donation_date', 'deferral_until', 'medical_history',
      'total_donations', 'response_rate', 'is_available'
    ];

    for (const field of allowedFields) {
      if (updateFields[field] !== undefined) {
        setClauses.push(`${field} = $${idx}`);
        values.push(updateFields[field]);
        idx++;
      }
    }

    if (setClauses.length === 0) {
      return this.findById(donorId);
    }

    values.push(donorId);
    const sql = `UPDATE donor SET ${setClauses.join(', ')} WHERE donor_id = $${idx} RETURNING *`;
    const res = await db.query(sql, values);
    return res.rows[0];
  }

  async listDonors(filters = {}) {
    const conditions = ['1=1'];
    const values = [];
    let idx = 1;

    if (filters.bloodGroup) {
      conditions.push(`d.blood_group = $${idx}`);
      values.push(filters.bloodGroup);
      idx++;
    }

    if (filters.isAvailable !== undefined) {
      conditions.push(`d.is_available = $${idx}`);
      values.push(filters.isAvailable);
      idx++;
    }

    if (filters.city) {
      conditions.push(`LOWER(d.city) = LOWER($${idx})`);
      values.push(filters.city);
      idx++;
    }

    const sql = `
      SELECT d.donor_id, d.name, d.blood_group, d.age, d.weight, d.city, d.state,
             d.last_donation_date, d.deferral_until, d.total_donations, d.response_rate,
             d.is_available, u.email, u.phone
      FROM donor d
      JOIN users u ON d.donor_id = u.user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.response_rate DESC, d.total_donations DESC
    `;

    const res = await db.query(sql, values);
    return res.rows;
  }
}

module.exports = new DonorRepository();
