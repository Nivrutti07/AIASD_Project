const request = require('supertest');
const app = require('../src/app');
const { setupTestDb, generateToken } = require('./testHelper');
const db = require('../src/config/database');

describe('End-to-End API Routes Integration Test', () => {
  let adminToken;
  let staffToken;
  let hospitalToken;
  let donorToken;

  beforeAll(async () => {
    await setupTestDb();
    adminToken = generateToken('USR-ADMIN-01', 'ADMIN', 'admin@bloodconnect.org');
    staffToken = generateToken('USR-STAFF-01', 'BLOOD_BANK_STAFF', 'staff.central@bloodconnect.org');
    hospitalToken = generateToken('USR-HOSP-01', 'HOSPITAL', 'emergency@cityhospital.org');
    donorToken = generateToken('USR-DONOR-01', 'DONOR', 'donor.arun@gmail.com');
  });

  afterAll(async () => {
    await db.closePool();
  });

  test('GET /health returns 200 UP', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.system).toContain('Blood Donation');
  });

  test('GET /api/team returns team member details', async () => {
    const res = await request(app).get('/api/team');
    expect(res.status).toBe(200);
    expect(res.body.team).toHaveLength(4);
    expect(res.body.team.map(t => t.roll_no)).toEqual(expect.arrayContaining(['323', '332', '333', '335']));
  });

  test('POST /api/auth/login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'staff.central@bloodconnect.org',
        password: 'Password123!'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.role).toBe('BLOOD_BANK_STAFF');
  });

  test('POST /api/requests creates emergency blood request', async () => {
    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 5);

    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${hospitalToken}`)
      .send({
        blood_group: 'O-',
        component: 'RBC',
        quantity: 1,
        urgency: 'CRITICAL',
        required_by: futureDate.toISOString()
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.req_id).toBeDefined();
    expect(res.body.data.status).toBe('PENDING');
  });

  test('GET /api/donors hides donor phone number from hospital user', async () => {
    const res = await request(app)
      .get('/api/donors')
      .set('Authorization', `Bearer ${hospitalToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    res.body.data.forEach(donor => {
      expect(donor.phone).toBeUndefined();
    });
  });

  test('GET /api/reports/dashboard returns system metrics', async () => {
    const res = await request(app)
      .get('/api/reports/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total_donors).toBeDefined();
  });

  test('Returns 404 for unknown route', async () => {
    const res = await request(app).get('/api/unknown-endpoint');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});
