const authService = require('../src/modules/auth/auth.service');
const { setupTestDb } = require('./testHelper');
const db = require('../src/config/database');

describe('FR-01: Authentication & ISA Role Specialization', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await db.closePool();
  });

  test('Valid login returns user details and JWT token', async () => {
    const result = await authService.authenticateUser('staff.central@bloodconnect.org', 'Password123!');
    expect(result).toBeDefined();
    expect(result.token).toBeDefined();
    expect(result.user.role).toBe('BLOOD_BANK_STAFF');
    expect(result.user.profile).toBeDefined();
    expect(result.user.profile.name).toBe('Central Red Cross Blood Bank');
  });

  test('Rejects invalid password', async () => {
    await expect(
      authService.authenticateUser('staff.central@bloodconnect.org', 'WrongPassword!')
    ).rejects.toThrow('Invalid email or password');
  });

  test('Rejects nonexistent user email', async () => {
    await expect(
      authService.authenticateUser('nonexistent@bloodconnect.org', 'Password123!')
    ).rejects.toThrow('Invalid email or password');
  });

  test('Registers new Donor with disjoint ISA profile', async () => {
    const created = await authService.registerUser(
      {
        email: 'new.donor@gmail.com',
        password: 'Password123!',
        phone: '+919999988888',
        role: 'DONOR'
      },
      {
        name: 'New Registered Donor',
        bloodGroup: 'B+',
        age: 26,
        weight: 68.0,
        city: 'Hubli',
        state: 'Karnataka'
      }
    );

    expect(created.userId).toBeDefined();
    expect(created.role).toBe('DONOR');

    // Verify disjoint subtype record in donor table
    const donorRes = await db.query('SELECT * FROM donor WHERE donor_id = $1', [created.userId]);
    expect(donorRes.rows.length).toBe(1);
    expect(donorRes.rows[0].blood_group).toBe('B+');
    expect(parseFloat(donorRes.rows[0].weight)).toBe(68.0);
  });
});
