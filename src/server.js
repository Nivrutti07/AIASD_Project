const app = require('./app');
const env = require('./config/env');
const db = require('./config/database');
const logger = require('./utils/logger');
const fs = require('fs');
const path = require('path');

async function startServer() {
  try {
    // Ensure storage directory exists
    const storageDir = path.resolve(env.STORAGE_DIR);
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    // Initialize Database
    await db.initDatabase();

    // Optionally auto-seed if running in-memory or fresh DB
    try {
      const checkRes = await db.query('SELECT COUNT(*) as cnt FROM users');
      if (parseInt(checkRes.rows[0].cnt, 10) === 0) {
        logger.info('No users detected in database. Executing seed script...');
        const seedSql = fs.readFileSync(path.join(__dirname, 'models/seed.sql'), 'utf8');
        await db.query(seedSql);
        logger.info('Automatic seed script executed successfully.');
      }
    } catch (seedErr) {
      logger.warn('Seed verification notice:', { message: seedErr.message });
    }

    // Start Express listener
    const server = app.listen(env.PORT, () => {
      logger.info(`=======================================================`);
      logger.info(` Blood Donation & Emergency Request System Backend`);
      logger.info(` Server running in [${env.NODE_ENV}] mode on port ${env.PORT}`);
      logger.info(` Health endpoint: http://localhost:${env.PORT}/health`);
      logger.info(` Database mode: ${db.isInMemory() ? 'pg-mem (In-Memory PostgreSQL)' : 'Live PostgreSQL'}`);
      logger.info(`=======================================================`);
    });

    // Graceful shutdown handling
    const shutdown = async () => {
      logger.info('Shutting down server gracefully...');
      server.close(async () => {
        await db.closePool();
        logger.info('Server and database pool closed. Process terminating.');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (err) {
    logger.error('Failed to start server:', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = startServer;
