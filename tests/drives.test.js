const driveService = require('../src/modules/donation_drive/drive.service');
const { setupTestDb } = require('./testHelper');
const db = require('../src/config/database');

describe('FR-11: Donation Drives & Slot Booking', () => {
  const staffUser = {
    userId: 'USR-STAFF-01',
    role: 'BLOOD_BANK_STAFF'
  };

  const donorUser = {
    userId: 'USR-DONOR-03', // Eligible A+ donor in Dharwad
    role: 'DONOR'
  };

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await db.closePool();
  });

  test('Staff can create a new donation drive', async () => {
    const drive = await driveService.createDrive(
      {
        title: 'Community Blood Drive',
        location: 'City Town Hall',
        drive_date: '2026-12-20',
        capacity: 10
      },
      staffUser
    );

    expect(drive).toBeDefined();
    expect(drive.title).toBe('Community Blood Drive');
    expect(drive.capacity).toBe(10);
  });

  test('Eligible donor can book an available slot', async () => {
    const result = await driveService.bookDonationSlot(
      {
        drive_id: 'DRV-2026-002', // KLE Tech drive
        donor_id: 'USR-DONOR-03',
        slot_time: '11:30'
      },
      donorUser
    );

    expect(result.booking).toBeDefined();
    expect(result.booking.status).toBe('BOOKED');
    expect(result.remaining_slots).toBe(39); // 40 - 1 = 39
  });

  test('Prevents duplicate booking for the same donor on the same drive', async () => {
    await expect(
      driveService.bookDonationSlot(
        {
          drive_id: 'DRV-2026-002',
          donor_id: 'USR-DONOR-03',
          slot_time: '14:00'
        },
        donorUser
      )
    ).rejects.toThrow('Donor already has an active booking for this donation drive');
  });

  test('Prevents overbooking when drive is at full capacity', async () => {
    // Create a drive with capacity 1
    const smallDrive = await driveService.createDrive(
      {
        title: 'Small Drive',
        location: 'Clinic',
        drive_date: '2026-12-25',
        capacity: 1
      },
      staffUser
    );

    // First booking
    await driveService.bookDonationSlot(
      {
        drive_id: smallDrive.drive_id,
        donor_id: 'USR-DONOR-04',
        slot_time: '10:00'
      },
      { userId: 'USR-DONOR-04', role: 'DONOR' }
    );

    // Second booking attempt should fail with DRIVE_CAPACITY_FULL
    await expect(
      driveService.bookDonationSlot(
        {
          drive_id: smallDrive.drive_id,
          donor_id: 'USR-DONOR-01',
          slot_time: '10:30'
        },
        { userId: 'USR-DONOR-01', role: 'DONOR' }
      )
    ).rejects.toThrow('Drive is at full capacity');
  });
});
