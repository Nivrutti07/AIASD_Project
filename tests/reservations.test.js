const reservationService = require('../src/modules/reservation/reservation.service');
const { setupTestDb } = require('./testHelper');
const db = require('../src/config/database');

describe('FR-10 & Part-B Algorithm: reserveAndFulfillBloodRequest', () => {
  const staffUser = {
    userId: 'USR-STAFF-01',
    role: 'BLOOD_BANK_STAFF'
  };

  const donorUser = {
    userId: 'USR-DONOR-01',
    role: 'DONOR'
  };

  beforeEach(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await db.closePool();
  });

  test('Fulfills blood request atomically and updates inventory & request status', async () => {
    // REQ-2026-001 requests 2 units of O+ RBC
    // UNIT-O-POS-001 has 10 units of O+ RBC
    const result = await reservationService.reserveAndFulfillBloodRequest(
      'REQ-2026-001',
      'USR-STAFF-01',
      'UNIT-O-POS-001',
      2,
      staffUser
    );

    expect(result.success).toBe(true);
    expect(result.allocated_units).toBe(2);
    expect(result.remaining_unit_stock).toBe(8); // 10 - 2 = 8
    expect(result.request_status).toBe('FULFILLED');

    // Verify DB state
    const unitCheck = await db.query(
      'SELECT quantity FROM blood_unit WHERE blood_bank_id = $1 AND blood_unit_id = $2',
      ['USR-STAFF-01', 'UNIT-O-POS-001']
    );
    expect(unitCheck.rows[0].quantity).toBe(8);

    const reqCheck = await db.query(
      'SELECT status, fulfilled_quantity FROM blood_request WHERE req_id = $1',
      ['REQ-2026-001']
    );
    expect(reqCheck.rows[0].status).toBe('FULFILLED');
    expect(reqCheck.rows[0].fulfilled_quantity).toBe(2);

    // Verify Audit Log recorded
    const auditCheck = await db.query(
      "SELECT * FROM audit_logs WHERE action = 'BLOOD_REQUEST_RESERVED_AND_FULFILLED' AND entity_id = $1",
      [result.reservation_id]
    );
    expect(auditCheck.rows.length).toBe(1);
  });

  test('Rejects fulfillment attempt by non-staff user (Role authorization check)', async () => {
    await expect(
      reservationService.reserveAndFulfillBloodRequest(
        'REQ-2026-001',
        'USR-STAFF-01',
        'UNIT-O-POS-001',
        2,
        donorUser // Invalid role
      )
    ).rejects.toThrow('Unauthorized: Blood Bank Staff or Admin login required');
  });

  test('Rejects fulfillment with incompatible blood unit', async () => {
    // Recipient requested O+, trying to fulfill with A+ RBC
    await expect(
      reservationService.reserveAndFulfillBloodRequest(
        'REQ-2026-001',
        'USR-STAFF-01',
        'UNIT-A-POS-001', // A+ is incompatible with O+ recipient
        2,
        staffUser
      )
    ).rejects.toThrow('Incompatible blood group');
  });

  test('Rejects fulfillment when requested units exceed unit stock', async () => {
    // UNIT-O-NEG-001 has 4 units, requesting 10
    await expect(
      reservationService.reserveAndFulfillBloodRequest(
        'REQ-2026-001',
        'USR-STAFF-01',
        'UNIT-O-NEG-001',
        10,
        staffUser
      )
    ).rejects.toThrow('Insufficient blood stock');
  });

  test('Prevents double allocation on already fulfilled request', async () => {
    // First fulfillment
    await reservationService.reserveAndFulfillBloodRequest(
      'REQ-2026-001',
      'USR-STAFF-01',
      'UNIT-O-POS-001',
      2,
      staffUser
    );

    // Second fulfillment attempt on same request
    await expect(
      reservationService.reserveAndFulfillBloodRequest(
        'REQ-2026-001',
        'USR-STAFF-01',
        'UNIT-O-POS-001',
        1,
        staffUser
      )
    ).rejects.toThrow('Invalid or already fulfilled request');
  });
});
