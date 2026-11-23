require('dotenv').config();

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 5000,
  JWT_SECRET: process.env.JWT_SECRET || 'blood_bank_jwt_secure_secret_key_2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  
  // Database configuration
  DB_HOST: process.env.DB_HOST || process.env.PGHOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432', 10),
  DB_USER: process.env.DB_USER || process.env.PGUSER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || process.env.PGPASSWORD || 'postgres',
  DB_NAME: process.env.DB_NAME || process.env.PGDATABASE || 'blood_donation_db',
  DATABASE_URL: process.env.DATABASE_URL || null,
  
  // Automatic in-memory fallback if real PostgreSQL is not running
  USE_IN_MEMORY_DB: process.env.USE_IN_MEMORY_DB === 'true' || false,
  
  // File storage paths for CSV reports & attachments
  STORAGE_DIR: process.env.STORAGE_DIR || './storage'
};
