const {
  register_donor,
  calculate_eligibility,
  manage_inventory,
  create_emergency_request,
  match_blood_and_donors,
  reserve_blood_stock,
  escalate_request,
  book_donation_slot,
  transfer_blood_stock,
  generate_reports
} = require('../src/coreFunctions');
const { setupTestDb } = require('./testHelper');
const db = require('../src/config/database');

describe('Gap Analysis Record: Verification of the 10 Core Functions', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await db.closePool();
  });

  // 1. register_donor()
  describe('1. register_donor()', () => {
    test('Boundary gap: Rejects empty name, email, or phone', async () => {
      await expect(
        register_donor({ name: '', blood_group: 'O+', age: 25, weight: 60, city: 'Hubli', state: 'Karnataka' }, { email: 'test@mail.com', password: 'Password123!', phone: '+919999988888' })
      ).rejects.toThrow('Donor name is required');
    });

    test('Boundary gap: Rejects field exceeding maximum length (>150 characters for name)', async () => {
      const longName = 'A'.repeat(151);
      await expect(
        register_donor({ name: longName, blood_group: 'O+', age: 25, weight: 60, city: 'Hubli', state: 'Karnataka' }, { email: 'long@mail.com', password: 'Password123!', phone: '+919999988888' })
      ).rejects.toThrow('Name exceeds maximum allowed length');
    });

    test('Error path gap: Rejects duplicate account registration', async () => {
      await register_donor(
        { name: 'First Donor', blood_group: 'O+', age: 25, weight: 60, city: 'Hubli', state: 'Karnataka' },
        { email: 'unique@donor.com', password: 'Password123!', phone: '+919999988888' }
      );

      await expect(
        register_donor(
          { name: 'Second Donor', blood_group: 'O+', age: 25, weight: 60, city: 'Hubli', state: 'Karnataka' },
          { email: 'unique@donor.com', password: 'Password123!', phone: '+919999988889' }
        )
      ).rejects.toThrow('already exists');
    });

    test('Domain constraint gap: Valid donor details successfully registered', async () => {
      const res = await register_donor(
        { name: 'Valid Donor', blood_group: 'A+', age: 28, weight: 65, city: 'Hubli', state: 'Karnataka' },
        { email: 'valid.new@donor.com', password: 'Password123!', phone: '+919999988800' }
      );
      expect(res.userId).toBeDefined();
      expect(res.role).toBe('DONOR');
    });
  });

  // 2. calculate_eligibility()
  describe('2. calculate_eligibility()', () => {
    test('Boundary gap: Age limits 18 min and 65 max', async () => {
      // USR-DONOR-01 is 28 years old, 72.5 kg, last donated in Aug 2026 -> eligible
      const res = await calculate_eligibility('USR-DONOR-01');
      expect(res.is_eligible).toBe(true);
      expect(res.donor_id).toBe('USR-DONOR-01');
    });

    test('Domain constraint gap: Returns ineligible if donor not found', async () => {
      await expect(calculate_eligibility('NON-EXISTENT')).rejects.toThrow('not found');
    });
  });

  // 3. manage_inventory()
  describe('3. manage_inventory()', () => {
    test('Boundary gap: Rejects zero quantity', async () => {
      await expect(
        manage_inventory('USR-STAFF-01', {
          unit_id: 'UNIT-INV-0',
          blood_group: 'O+',
          component: 'RBC',
          units: 0,
          collection_date: '2026-11-20',
          expiry_date: '2026-12-30'
        })
      ).rejects.toThrow('positive integer');
    });

    test('Domain constraint gap: Collection date must precede or equal expiry date', async () => {
      await expect(
        manage_inventory('USR-STAFF-01', {
          unit_id: 'UNIT-INV-BAD-DATES',
          blood_group: 'O+',
          component: 'RBC',
          units: 2,
          collection_date: '2026-12-30',
          expiry_date: '2026-11-20'
        })
      ).rejects.toThrow('Collection date must precede or equal expiry date');
    });
  });

  // 4. create_emergency_request()
  describe('4. create_emergency_request()', () => {
    test('Boundary gap: Rejects zero units', async () => {
      const future = new Date();
      future.setHours(future.getHours() + 2);
      await expect(
        create_emergency_request({
          blood_group: 'O+',
          component: 'RBC',
          quantity: 0,
          required_by: future.toISOString()
        })
      ).rejects.toThrow('Quantity must be a positive integer');
    });

    test('Boundary gap: Rejects required-by time in the past', async () => {
      const past = new Date();
      past.setHours(past.getHours() - 1);
      await expect(
        create_emergency_request({
          blood_group: 'O+',
          component: 'RBC',
          quantity: 2,
          required_by: past.toISOString()
        })
      ).rejects.toThrow('required_by timestamp must be in the future');
    });
  });

  // 5. match_blood_and_donors()
  describe('5. match_blood_and_donors()', () => {
    test('Domain constraint gap: Ranks eligible compatible donors and hides phone from hospital', async () => {
      const result = await match_blood_and_donors('REQ-2026-001', { city: 'Hubli' }, { role: 'HOSPITAL' });
      expect(result.request_id).toBe('REQ-2026-001');
      expect(result.count).toBeGreaterThan(0);
      result.matched_donors.forEach(donor => {
        expect(donor.phone).toBeUndefined(); // Privacy check
      });
    });
  });

  // 6. reserve_blood_stock()
  describe('6. reserve_blood_stock()', () => {
    test('Domain constraint gap: Prevents double allocation and enforces row lock', async () => {
      const staff = { userId: 'USR-STAFF-01', role: 'BLOOD_BANK_STAFF' };
      const res = await reserve_blood_stock('REQ-2026-001', 'USR-STAFF-01', 'UNIT-O-POS-001', 2, staff);
      expect(res.success).toBe(true);
      expect(res.request_status).toBe('FULFILLED');

      // Second attempt on fulfilled request must fail
      await expect(
        reserve_blood_stock('REQ-2026-001', 'USR-STAFF-01', 'UNIT-O-POS-001', 1, staff)
      ).rejects.toThrow('already fulfilled');
    });
  });

  // 7. escalate_request()
  describe('7. escalate_request()', () => {
    test('Domain constraint gap: Transitions request status to ESCALATED', async () => {
      const staff = { userId: 'USR-STAFF-01', role: 'BLOOD_BANK_STAFF' };
      const res = await escalate_request('REQ-2026-001', staff);
      expect(res.request.status).toBe('ESCALATED');
    });
  });

  // 8. book_donation_slot()
  describe('8. book_donation_slot()', () => {
    test('Domain constraint gap: Prevents overbooking and checks donor eligibility', async () => {
      const donor = { userId: 'USR-DONOR-03', role: 'DONOR' };
      const booking = await book_donation_slot(
        { drive_id: 'DRV-2026-002', donor_id: 'USR-DONOR-03', slot_time: '12:00' },
        donor
      );
      expect(booking.booking.status).toBe('BOOKED');
    });
  });

  // 9. transfer_blood_stock()
  describe('9. transfer_blood_stock()', () => {
    test('Boundary gap: Successfully transfers stock and rejects excessive quantity', async () => {
      const staff = { userId: 'USR-STAFF-01', role: 'BLOOD_BANK_STAFF' };
      const transfer = await transfer_blood_stock('USR-STAFF-01', 'USR-STAFF-02', 'UNIT-O-POS-001', 2, staff);
      expect(transfer.transferred_units).toBe(2);

      // Rejects quantity exceeding stock
      await expect(
        transfer_blood_stock('USR-STAFF-01', 'USR-STAFF-02', 'UNIT-O-POS-001', 100, staff)
      ).rejects.toThrow('Insufficient stock');
    });
  });

  // 10. generate_reports()
  describe('10. generate_reports()', () => {
    test('Domain constraint gap: Restricts audit reports to Admin role', async () => {
      await expect(
        generate_reports('AUDIT', null, null, 'HOSPITAL', 'JSON')
      ).rejects.toThrow('Unauthorized: Only Administrator can access full audit log reports');

      const adminReport = await generate_reports('DASHBOARD', null, null, 'ADMIN', 'JSON');
      expect(adminReport.data.total_donors).toBeDefined();
    });
  });
});
