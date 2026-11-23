const inventoryService = require('../src/modules/inventory/inventory.service');
const { setupTestDb } = require('./testHelper');
const db = require('../src/config/database');

describe('FR-04 & FR-05: Blood Inventory Management & Tracking', () => {
  const staffUser = {
    userId: 'USR-STAFF-01',
    role: 'BLOOD_BANK_STAFF'
  };

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await db.closePool();
  });

  test('Staff can track a valid new blood unit', async () => {
    const unit = await inventoryService.trackBloodUnit(
      'USR-STAFF-01',
      {
        unit_id: 'UNIT-NEW-999',
        blood_group: 'A-',
        component: 'RBC',
        units: 5,
        collection_date: '2026-11-20',
        expiry_date: '2026-12-30'
      },
      staffUser
    );

    expect(unit).toBeDefined();
    expect(unit.blood_unit_id).toBe('UNIT-NEW-999');
    expect(unit.quantity).toBe(5);
  });

  test('Rejects negative or zero quantity', async () => {
    await expect(
      inventoryService.trackBloodUnit(
        'USR-STAFF-01',
        {
          unit_id: 'UNIT-ZERO-01',
          blood_group: 'O+',
          component: 'RBC',
          units: 0,
          collection_date: '2026-11-20',
          expiry_date: '2026-12-30'
        },
        staffUser
      )
    ).rejects.toThrow('Blood unit quantity must be a positive integer');
  });

  test('Rejects collection_date following expiry_date', async () => {
    await expect(
      inventoryService.trackBloodUnit(
        'USR-STAFF-01',
        {
          unit_id: 'UNIT-BAD-DATES',
          blood_group: 'O+',
          component: 'RBC',
          units: 3,
          collection_date: '2026-12-30',
          expiry_date: '2026-11-20' // earlier than collection
        },
        staffUser
      )
    ).rejects.toThrow('Collection date must precede or equal expiry date');
  });

  test('Check inventory status correctly flags usable vs unusable units', async () => {
    const status = await inventoryService.checkInventoryStatus('USR-STAFF-01', 'UNIT-O-NEG-001');
    expect(status.blood_unit_id).toBe('UNIT-O-NEG-001');
    expect(status.is_usable).toBe(true);
    expect(status.is_expired).toBe(false);
  });

  test('Transfers blood stock atomically between blood banks', async () => {
    const transfer = await inventoryService.transferBloodStock(
      'USR-STAFF-01',
      'USR-STAFF-02',
      'UNIT-O-POS-001',
      2,
      staffUser
    );

    expect(transfer.transferred_units).toBe(2);
    expect(transfer.source_remaining).toBe(8); // initially 10
  });

  test('Rejects transfer when requested quantity exceeds available stock', async () => {
    await expect(
      inventoryService.transferBloodStock(
        'USR-STAFF-01',
        'USR-STAFF-02',
        'UNIT-O-NEG-001',
        100, // exceeds available 4
        staffUser
      )
    ).rejects.toThrow('Insufficient stock');
  });
});
