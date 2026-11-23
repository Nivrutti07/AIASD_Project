const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const logger = require('../utils/logger');

async function runSeed() {
  try {
    await db.initDatabase();
    const seedPath = path.join(__dirname, 'seed.sql');
    if (fs.existsSync(seedPath)) {
      const sql = fs.readFileSync(seedPath, 'utf8');
      await db.query(sql);
      logger.info('Database seed successfully applied.');
    }
    await db.closePool();
    process.exit(0);
  } catch (err) {
    logger.error('Failed to run database seed:', { error: err.message });
    process.exit(1);
  }
}

if (require.main === module) {
  runSeed();
}

module.exports = runSeed;
