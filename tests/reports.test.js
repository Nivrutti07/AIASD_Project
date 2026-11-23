const reportService = require('../src/modules/reporting_audit/report.service');
const { setupTestDb } = require('./testHelper');
const db = require('../src/config/database');
const fs = require('fs');

describe('FR-12: System Reporting, Auditing & CSV Export', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await db.closePool();
  });

  test('Generates dashboard metrics summary', async () => {
    const report = await reportService.generateSystemReport('DASHBOARD', null, null, 'ADMIN', 'JSON');
    expect(report.data).toBeDefined();
    expect(report.data.total_donors).toBeGreaterThan(0);
    expect(report.data.total_available_blood_units).toBeGreaterThan(0);
  });

  test('Generates CSV inventory export file', async () => {
    const report = await reportService.generateSystemReport('INVENTORY', null, null, 'BLOOD_BANK_STAFF', 'CSV');
    expect(report.format).toBe('CSV');
    expect(report.csv_content).toContain('"blood_unit_id"');
    expect(report.file_path).toBeDefined();
    expect(fs.existsSync(report.file_path)).toBe(true);
  });

  test('Rejects audit report request from non-admin role', async () => {
    await expect(
      reportService.generateSystemReport('AUDIT', null, null, 'DONOR', 'JSON')
    ).rejects.toThrow('Unauthorized: Only Administrator can access full audit log reports');
  });

  test('Admin can access immutable audit logs', async () => {
    const report = await reportService.generateSystemReport('AUDIT', null, null, 'ADMIN', 'JSON');
    expect(report.data).toBeDefined();
    expect(Array.isArray(report.data)).toBe(true);
    expect(report.data.length).toBeGreaterThan(0);
  });
});
