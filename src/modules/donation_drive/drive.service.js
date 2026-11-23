const { v4: uuidv4 } = require('uuid');
const driveRepository = require('./drive.repository');
const eligibilityService = require('../eligibility/eligibility.service');
const db = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');

class DriveService {
  /**
   * 8. book_donation_slot()
   * Gap Analysis:
   * Boundary gaps: Last available slot or full capacity
   * Error path gaps: Duplicate booking or ineligible donor
   * Domain constraint gaps: Donor eligibility and slot capacity
   * Specification addition: Booking limits, eligibility checks, and overbooking prevention via atomic row lock
   */
  async book_donation_slot(booking_data, user) {
    const actingUser = user || { userId: booking_data.donor_id, role: 'DONOR' };
    return this.bookDonationSlot(booking_data, actingUser);
  }

  async createDrive(driveData, user) {
    if (user.role !== 'BLOOD_BANK_STAFF' && user.role !== 'ADMIN') {
      throw new AppError('Unauthorized: Only Blood Bank Staff or Admin can create donation drives', 403, 'FORBIDDEN');
    }

    const { drive_id, title, location, drive_date, start_time, end_time, capacity, blood_bank_id } = driveData;

    if (!title || !title.trim()) {
      throw new AppError('Drive title is required', 400, 'MISSING_TITLE');
    }

    if (!location || !location.trim()) {
      throw new AppError('Drive location is required', 400, 'MISSING_LOCATION');
    }

    const cap = parseInt(capacity, 10);
    if (isNaN(cap) || cap <= 0) {
      throw new AppError('Drive capacity must be a positive integer (> 0)', 400, 'INVALID_CAPACITY');
    }

    const driveDate = new Date(drive_date);
    if (isNaN(driveDate.getTime())) {
      throw new AppError('Invalid drive_date format', 400, 'INVALID_DATE');
    }

    const driveId = drive_id || `DRV-${Date.now().toString().slice(-6)}-${uuidv4().substring(0, 4).toUpperCase()}`;
    const bankId = user.role === 'BLOOD_BANK_STAFF' ? user.userId : (blood_bank_id || user.userId);

    const created = await driveRepository.createDrive({
      driveId,
      bloodBankId: bankId,
      title: title.trim(),
      location: location.trim(),
      driveDate: driveDate.toISOString().split('T')[0],
      startTime: start_time || '09:00',
      endTime: end_time || '17:00',
      capacity: cap
    });

    // Audit log
    await db.query(
      `INSERT INTO audit_logs (log_id, user_id, action, entity_name, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        user.userId,
        'DONATION_DRIVE_CREATED',
        'DONATION_DRIVES',
        driveId,
        JSON.stringify({ title, location, capacity: cap, drive_date })
      ]
    );

    return created;
  }

  /**
   * FR-11: book_donation_slot(booking_id: str, donor_id: str, drive_id: str, ...) -> Booking
   * Atomic slot booking with eligibility check, capacity check, and double-booking prevention.
   */
  async bookDonationSlot(bookingData, user) {
    const { booking_id, drive_id, donor_id, slot_time } = bookingData;

    const donorId = (user.role === 'DONOR') ? user.userId : (donor_id || user.userId);

    // 1. Verify Donor Eligibility first!
    const eligibility = await eligibilityService.calculateEligibility(donorId, 'WHOLE_BLOOD');
    if (!eligibility.is_eligible) {
      throw new AppError(
        `Donor is currently ineligible to book a donation slot: ${eligibility.reasons.join('; ')}`,
        400,
        'DONOR_INELIGIBLE'
      );
    }

    const bookingId = booking_id || `BKG-${Date.now().toString().slice(-6)}-${uuidv4().substring(0, 4).toUpperCase()}`;

    // 2. Atomic transaction with FOR UPDATE row lock to prevent overbooking
    return db.withTransaction(async (client) => {
      // Check duplicate booking
      const existingBooking = await client.query(
        'SELECT * FROM slot_bookings WHERE drive_id = $1 AND donor_id = $2 AND status = $3',
        [drive_id, donorId, 'BOOKED']
      );

      if (existingBooking.rows.length > 0) {
        throw new AppError('Donor already has an active booking for this donation drive', 409, 'DUPLICATE_BOOKING');
      }

      // Lock the drive row
      const driveRes = await client.query(
        'SELECT * FROM donation_drives WHERE drive_id = $1 FOR UPDATE',
        [drive_id]
      );

      if (driveRes.rows.length === 0) {
        throw new AppError(`Donation drive '${drive_id}' not found`, 404, 'DRIVE_NOT_FOUND');
      }

      const drive = driveRes.rows[0];

      if (drive.status !== 'ACTIVE' && drive.status !== 'PLANNED') {
        throw new AppError(`Cannot book slot for drive with status '${drive.status}'`, 400, 'DRIVE_INACTIVE');
      }

      // Overbooking check
      if (drive.booked_count >= drive.capacity) {
        throw new AppError(
          `Drive is at full capacity (${drive.capacity}/${drive.capacity} booked). No slots remaining.`,
          400,
          'DRIVE_CAPACITY_FULL'
        );
      }

      // Increment booked_count
      const newBookedCount = drive.booked_count + 1;
      await client.query(
        'UPDATE donation_drives SET booked_count = $1 WHERE drive_id = $2',
        [newBookedCount, drive_id]
      );

      // Create booking record
      const slotTimeVal = slot_time || '10:00 AM';
      const insertRes = await client.query(
        `INSERT INTO slot_bookings (booking_id, drive_id, donor_id, slot_time, status)
         VALUES ($1, $2, $3, $4, 'BOOKED')
         RETURNING *`,
        [bookingId, drive_id, donorId, slotTimeVal]
      );

      // Audit log
      const logId = `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      await client.query(
        `INSERT INTO audit_logs (log_id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          logId,
          user.userId,
          'SLOT_BOOKED',
          'SLOT_BOOKINGS',
          bookingId,
          JSON.stringify({ drive_id, donorId, slot_time: slotTimeVal, booked_count: newBookedCount })
        ]
      );

      return {
        booking: insertRes.rows[0],
        drive_title: drive.title,
        remaining_slots: drive.capacity - newBookedCount
      };
    });
  }

  async cancelBooking(bookingId, user) {
    return db.withTransaction(async (client) => {
      const bRes = await client.query('SELECT * FROM slot_bookings WHERE booking_id = $1 FOR UPDATE', [bookingId]);
      if (bRes.rows.length === 0) {
        throw new AppError(`Booking '${bookingId}' not found`, 404, 'BOOKING_NOT_FOUND');
      }

      const booking = bRes.rows[0];

      if (user.role === 'DONOR' && user.userId !== booking.donor_id) {
        throw new AppError('Unauthorized: Can only cancel your own booking', 403, 'FORBIDDEN');
      }

      if (booking.status === 'CANCELLED') {
        throw new AppError('Booking is already cancelled', 400, 'ALREADY_CANCELLED');
      }

      // Update booking status
      await client.query("UPDATE slot_bookings SET status = 'CANCELLED' WHERE booking_id = $1", [bookingId]);

      // Decrement booked_count on drive
      await client.query(
        'UPDATE donation_drives SET booked_count = GREATEST(0, booked_count - 1) WHERE drive_id = $1',
        [booking.drive_id]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (log_id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          user.userId,
          'SLOT_BOOKING_CANCELLED',
          'SLOT_BOOKINGS',
          bookingId,
          JSON.stringify({ drive_id: booking.drive_id, donor_id: booking.donor_id })
        ]
      );

      return { message: 'Booking cancelled successfully' };
    });
  }

  async listDrives(filters) {
    return driveRepository.listDrives(filters);
  }

  async getDrive(driveId) {
    const drive = await driveRepository.findDriveById(driveId);
    if (!drive) {
      throw new AppError(`Donation drive '${driveId}' not found`, 404, 'DRIVE_NOT_FOUND');
    }
    const bookings = await driveRepository.listBookingsByDrive(driveId);
    return { ...drive, bookings };
  }

  async getMyBookings(donorId) {
    return driveRepository.listBookingsByDonor(donorId);
  }
}

const driveService = new DriveService();
driveService.book_donation_slot = driveService.book_donation_slot.bind(driveService);
module.exports = driveService;
module.exports.book_donation_slot = driveService.book_donation_slot;
