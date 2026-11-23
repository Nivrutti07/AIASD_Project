const fs = require('fs');
const path = require('path');
const env = require('../config/env');

/**
 * Converts array of objects into standard CSV text
 * and optionally writes to local storage directory.
 */
function convertToCSV(data, fields = null) {
  if (!Array.isArray(data) || data.length === 0) {
    return fields ? fields.join(',') + '\n' : '';
  }

  const keys = fields || Object.keys(data[0]);
  const header = keys.map(k => `"${k}"`).join(',');

  const rows = data.map(row => {
    return keys.map(k => {
      let val = row[k];
      if (val === null || val === undefined) {
        return '""';
      }
      if (val instanceof Date) {
        val = val.toISOString();
      } else if (typeof val === 'object') {
        val = JSON.stringify(val);
      }
      // Escape double quotes
      const stringVal = String(val).replace(/"/g, '""');
      return `"${stringVal}"`;
    }).join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Saves CSV content to file system in storage directory
 */
function saveCSVToFile(filename, csvContent) {
  const dir = path.resolve(env.STORAGE_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, csvContent, 'utf8');
  return filePath;
}

module.exports = {
  convertToCSV,
  saveCSVToFile
};
