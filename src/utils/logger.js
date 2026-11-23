const fs = require('fs');
const path = require('path');

const logLevels = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  AUDIT: 'AUDIT'
};

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

const logger = {
  info: (msg, meta) => console.log(formatMessage(logLevels.INFO, msg, meta)),
  warn: (msg, meta) => console.warn(formatMessage(logLevels.WARN, msg, meta)),
  error: (msg, meta) => console.error(formatMessage(logLevels.ERROR, msg, meta)),
  audit: (msg, meta) => console.log(formatMessage(logLevels.AUDIT, msg, meta))
};

module.exports = logger;
