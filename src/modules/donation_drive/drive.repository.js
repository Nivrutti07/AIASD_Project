const db = require('../../config/database');

class DriveRepository {
  async findDriveById(driveId) {
    const res = await db.query(
      `SELECT d.drive_id, d.blood_bank_id, d.title, d.location, d.drive_date,
              d.start_time, d.end_time, d.capacity, d.booked_count, d.status,
              b.name as blood_bank_name, b.city, b.state
       FROM donation_drives d
       JOIN blood_bank b ON d.blood_bank_id = b.blood_bank_id
       WHERE d.drive_id = $1`,
      [driveId]
    );
    return res.rows[0] || null;
  }

  async createDrive(driveData) {
    const res = await db.query(
      `INSERT INTO donation_drives (drive_id, blood_bank_id, title, location, drive_date, start_time, end_time, capacity, booked_count, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 'ACTIVE')
       RETURNING *`,
      [
        driveData.driveId,
        driveData.bloodBankId,
        driveData.title,
        driveData.location,
        driveData.driveDate,
        driveData.startTime,
        driveData.endTime,
        driveData.capacity
      ]
    );
    return res.rows[0];
  }

  async listDrives(filters = {}) {
    const conditions = ['1=1'];
    const values = [];
    let idx = 1;

    if (filters.status) {
      conditions.push(`d.status = $${idx}`);
      values.push(filters.status);
      idx++;
    }

    if (filters.bloodBankId) {
      conditions.push(`d.blood_bank_id = $${idx}`);
      values.push(filters.bloodBankId);
      idx++;
    }

    const sql = `
      SELECT d.drive_id, d.blood_bank_id, d.title, d.location, d.drive_date,
             d.start_time, d.end_time, d.capacity, d.booked_count, d.status,
             (d.capacity - d.booked_count) as available_slots,
             b.name as blood_bank_name, b.city, b.state
      FROM donation_drives d
      JOIN blood_bank b ON d.blood_bank_id = b.blood_bank_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.drive_date ASC
    `;

    const res = await db.query(sql, values);
    return res.rows;
  }

  async findBooking(driveId, donorId) {
    const res = await db.query(
      'SELECT * FROM slot_bookings WHERE drive_id = $1 AND donor_id = $2',
      [driveId, donorId]
    );
    return res.rows[0] || null;
  }

  async listBookingsByDrive(driveId) {
    const res = await db.query(
      `SELECT b.booking_id, b.drive_id, b.donor_id, b.slot_time, b.status, b.created_at,
              d.name as donor_name, d.blood_group, u.phone
       FROM slot_bookings b
       JOIN donor d ON b.donor_id = d.donor_id
       JOIN users u ON d.donor_id = u.user_id
       WHERE b.drive_id = $1
       ORDER BY b.slot_time ASC`,
      [driveId]
    );
    return res.rows;
  }

  async listBookingsByDonor(donorId) {
    const res = await db.query(
      `SELECT b.booking_id, b.drive_id, b.slot_time, b.status, b.created_at,
              d.title as drive_title, d.location, d.drive_date, bb.name as blood_bank_name
       FROM slot_bookings b
       JOIN donation_drives d ON b.drive_id = d.drive_id
       JOIN blood_bank bb ON d.blood_bank_id = bb.blood_bank_id
       WHERE b.donor_id = $1
       ORDER BY d.drive_date ASC`,
      [donorId]
    );
    return res.rows;
  }
}

module.exports = new DriveRepository();
