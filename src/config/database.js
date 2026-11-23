const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const env = require('./env');
const logger = require('../utils/logger');

let pool = null;
let isInMemory = false;

/**
 * Initializes in-memory PostgreSQL instance using pg-mem
 */
function createInMemoryPool() {
  const { newDb } = require('pg-mem');
  const db = newDb();

  // Register common pg functions not built into pg-mem by default
  db.public.registerFunction({
    name: 'version',
    args: [],
    returns: db.public.getType('text'),
    implementation: () => 'PostgreSQL 15.0 (pg-mem in-memory emulation)'
  });

  const adapter = db.adapters.createPg();
  const memPool = new adapter.Pool();
  isInMemory = true;
  logger.info('Initialized pg-mem in-memory PostgreSQL engine.');
  return memPool;
}

/**
 * Connects to PostgreSQL or falls back to in-memory DB
 */
async function initDatabase() {
  if (pool) return pool;

  if (env.USE_IN_MEMORY_DB) {
    logger.info('Configuration forced USE_IN_MEMORY_DB = true.');
    pool = createInMemoryPool();
  } else {
    try {
      const config = env.DATABASE_URL
        ? { connectionString: env.DATABASE_URL }
        : {
            host: env.DB_HOST,
            port: env.DB_PORT,
            user: env.DB_USER,
            password: env.DB_PASSWORD,
            database: env.DB_NAME,
            connectionTimeoutMillis: 2000
          };

      const testPool = new Pool(config);
      // Test real connection
      const client = await testPool.connect();
      client.release();
      pool = testPool;
      logger.info(`Connected to PostgreSQL database at ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`);
    } catch (err) {
      logger.warn(`Could not connect to PostgreSQL server (${err.message}). Falling back to pg-mem in-memory PostgreSQL.`);
      pool = createInMemoryPool();
    }
  }

  // Run schema initialization
  await runMigrations();
  return pool;
}

/**
 * Executes schema DDL
 */
async function runMigrations() {
  const schemaPath = path.join(__dirname, '../models/schema.sql');
  if (fs.existsSync(schemaPath)) {
    const ddl = fs.readFileSync(schemaPath, 'utf8');
    try {
      await pool.query(ddl);
      logger.info('Database schema successfully initialized.');
    } catch (err) {
      logger.error('Failed to run schema DDL:', { error: err.message });
      throw err;
    }
  }
}

/**
 * Executes a single SQL query
 */
async function query(text, params) {
  if (!pool) {
    await initDatabase();
  }
  return pool.query(text, params);
}

/**
 * Acquires a client connection for multi-step operations or transactions
 */
async function getClient() {
  if (!pool) {
    await initDatabase();
  }
  return pool.connect();
}

/**
 * Helper to run a callback inside an atomic PostgreSQL transaction with rollback
 */
async function withTransaction(callback) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Closes the pool on application shutdown
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed.');
  }
}

module.exports = {
  initDatabase,
  query,
  getClient,
  withTransaction,
  closePool,
  isInMemory: () => isInMemory
};
