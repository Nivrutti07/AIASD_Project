const db = require('../../config/database');

class AuthRepository {
  async findByEmail(email) {
    const res = await db.query(
      `SELECT u.user_id, u.email, u.password_hash, u.phone, u.role, u.created_at
       FROM users u WHERE LOWER(u.email) = LOWER($1)`,
      [email]
    );
    return res.rows[0] || null;
  }

  async findById(userId) {
    const res = await db.query(
      `SELECT u.user_id, u.email, u.phone, u.role, u.created_at
       FROM users u WHERE u.user_id = $1`,
      [userId]
    );
    if (!res.rows[0]) return null;

    const user = res.rows[0];
    let profile = null;

    if (user.role === 'DONOR') {
      const d = await db.query('SELECT * FROM donor WHERE donor_id = $1', [userId]);
      profile = d.rows[0] || null;
    } else if (user.role === 'HOSPITAL') {
      const h = await db.query('SELECT * FROM hospital WHERE hospital_id = $1', [userId]);
      profile = h.rows[0] || null;
    } else if (user.role === 'BLOOD_BANK_STAFF') {
      const b = await db.query('SELECT * FROM blood_bank WHERE blood_bank_id = $1', [userId]);
      profile = b.rows[0] || null;
    } else if (user.role === 'PATIENT') {
      const p = await db.query('SELECT * FROM patient WHERE patient_id = $1', [userId]);
      profile = p.rows[0] || null;
    }

    return { ...user, profile };
  }

  async createUserWithSubtype(userData, profileData) {
    return db.withTransaction(async (client) => {
      // 1. Insert into supertype 'users'
      await client.query(
        `INSERT INTO users (user_id, email, password_hash, phone, role)
         VALUES ($1, $2, $3, $4, $5)`,
        [userData.userId, userData.email, userData.passwordHash, userData.phone, userData.role]
      );

      // 2. Insert into disjoint ISA subtype
      if (userData.role === 'DONOR') {
        await client.query(
          `INSERT INTO donor (donor_id, name, blood_group, age, weight, city, state, medical_history)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            userData.userId,
            profileData.name,
            profileData.bloodGroup,
            profileData.age,
            profileData.weight,
            profileData.city,
            profileData.state,
            profileData.medicalHistory || null
          ]
        );
      } else if (userData.role === 'HOSPITAL') {
        await client.query(
          `INSERT INTO hospital (hospital_id, name, address, contact_person)
           VALUES ($1, $2, $3, $4)`,
          [userData.userId, profileData.name, profileData.address || null, profileData.contactPerson || null]
        );
      } else if (userData.role === 'BLOOD_BANK_STAFF') {
        await client.query(
          `INSERT INTO blood_bank (blood_bank_id, name, line1, city, state, postal_code, contact_phone)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            userData.userId,
            profileData.name,
            profileData.line1 || 'Address Line 1',
            profileData.city || 'City',
            profileData.state || 'State',
            profileData.postalCode || null,
            userData.phone
          ]
        );
      } else if (userData.role === 'PATIENT') {
        await client.query(
          `INSERT INTO patient (patient_id, name, age, contact, blood_group)
           VALUES ($1, $2, $3, $4, $5)`,
          [userData.userId, profileData.name, profileData.age, userData.phone, profileData.bloodGroup]
        );
      }

      // 3. Create Audit Log Entry
      await client.query(
        `INSERT INTO audit_logs (log_id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          userData.userId,
          'USER_REGISTRATION',
          'USERS',
          userData.userId,
          JSON.stringify({ email: userData.email, role: userData.role })
        ]
      );

      return {
        userId: userData.userId,
        email: userData.email,
        role: userData.role
      };
    });
  }

  async recordLoginAudit(userId, ipAddress) {
    const logId = `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await db.query(
      `INSERT INTO audit_logs (log_id, user_id, action, entity_name, entity_id, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [logId, userId, 'USER_LOGIN', 'USERS', userId, ipAddress || '127.0.0.1']
    );
  }
}

module.exports = new AuthRepository();
