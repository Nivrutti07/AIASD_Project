const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const db = require('../src/config/database');
const fs = require('fs');
const path = require('path');

// Generate test JWT token for any role and user
function generateToken(userId, role, email) {
  return jwt.sign(
    { userId, role, email },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Reset database schema and seed fresh data
async function setupTestDb() {
  await db.closePool();
  await db.initDatabase();
  const seedSql = fs.readFileSync(path.join(__dirname, '../src/models/seed.sql'), 'utf8');
  await db.query(seedSql);
}

module.exports = {
  generateToken,
  setupTestDb
};
