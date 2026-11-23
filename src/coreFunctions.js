// =========================================================================
// Blood Donation and Emergency Request System - Core Gap Analysis Functions
// Directly implements the 10 functions specified in the Gap Analysis Record:
//   1. register_donor()
//   2. calculate_eligibility()
//   3. manage_inventory()
//   4. create_emergency_request()
//   5. match_blood_and_donors()
//   6. reserve_blood_stock()
//   7. escalate_request()
//   8. book_donation_slot()
//   9. transfer_blood_stock()
//  10. generate_reports()
// =========================================================================

const authService = require('./modules/auth/auth.service');
const donorService = require('./modules/donor/donor.service');
const eligibilityService = require('./modules/eligibility/eligibility.service');
const inventoryService = require('./modules/inventory/inventory.service');
const compatibilityService = require('./modules/compatibility/compatibility.service');
const requestService = require('./modules/emergency_request/request.service');
const reservationService = require('./modules/reservation/reservation.service');
const driveService = require('./modules/donation_drive/drive.service');
const reportService = require('./modules/reporting_audit/report.service');
const { AppError } = require('./middleware/errorHandler');
const { BLOOD_GROUPS, COMPONENTS, URGENCY_LEVELS } = require('./config/rules');

/**
 * 1. register_donor()
 * Boundary gaps: Empty strings, maximum-length fields (name max 150, email max 120, phone max 30)
 * Error path gaps: Duplicate account/email (409), invalid input formats
 * Domain constraint gaps: Valid age (16-100), weight (> 0), required donor details (blood group, city, state)
 * Specification addition: Enforces field limits, validation, and duplicate-registration prevention
 */
async function register_donor(donorData = {}, credentials = {}) {
  const { email, password, phone } = credentials;
  const { name, blood_group, age, weight, city, state, medical_history } = donorData;

  // Boundary checks: empty fields
  if (!email || !email.trim()) throw new AppError('Email is required and cannot be empty', 400, 'INVALID_EMAIL');
  if (!password || !password.trim()) throw new AppError('Password is required and cannot be empty', 400, 'INVALID_PASSWORD');
  if (!phone || !phone.trim()) throw new AppError('Phone number is required and cannot be empty', 400, 'INVALID_PHONE');
  if (!name || !name.trim()) throw new AppError('Donor name is required and cannot be empty', 400, 'INVALID_NAME');

  // Maximum-length field boundaries
  if (email.length > 120) throw new AppError('Email exceeds maximum allowed length of 120 characters', 400, 'FIELD_TOO_LONG');
  if (name.length > 150) throw new AppError('Name exceeds maximum allowed length of 150 characters', 400, 'FIELD_TOO_LONG');
  if (phone.length > 30) throw new AppError('Phone number exceeds maximum allowed length of 30 characters', 400, 'FIELD_TOO_LONG');

  // Domain constraints: blood group
  const bg = (blood_group || '').trim().toUpperCase();
  if (!BLOOD_GROUPS.includes(bg)) {
    throw new AppError(`Invalid blood group: '${blood_group}'. Allowed: ${BLOOD_GROUPS.join(', ')}`, 400, 'INVALID_BLOOD_GROUP');
  }

  // Domain constraints: age and weight boundaries
  const donorAge = parseInt(age, 10);
  if (isNaN(donorAge) || donorAge < 16 || donorAge > 100) {
    throw new AppError('Donor age must be a valid number between 16 and 100', 400, 'INVALID_AGE');
  }

  const donorWeight = parseFloat(weight);
  if (isNaN(donorWeight) || donorWeight <= 0) {
    throw new AppError('Donor weight must be greater than 0 kg', 400, 'INVALID_WEIGHT');
  }

  if (!city || !city.trim() || !state || !state.trim()) {
    throw new AppError('City and State are required for location matching', 400, 'MISSING_LOCATION');
  }

  return authService.registerUser(
    { email: email.trim(), password: password.trim(), phone: phone.trim(), role: 'DONOR' },
    {
      name: name.trim(),
      bloodGroup: bg,
      age: donorAge,
      weight: donorWeight,
      city: city.trim(),
      state: state.trim(),
      medicalHistory: medical_history || null
    }
  );
}

/**
 * 2. calculate_eligibility()
 * Boundary gaps: Age or weight at configured limits (18 min, 65 max; 50 kg min)
 * Error path gaps: Missing medical details or invalid donation history handled gracefully
 * Domain constraint gaps: Donation interval (90 days for whole blood) and temporary deferral rules
 * Specification addition: Evaluates eligibility thresholds and boundary conditions
 */
async function calculate_eligibility(donor_id, component = 'WHOLE_BLOOD') {
  if (!donor_id || !String(donor_id).trim()) {
    throw new AppError('Valid donor_id is required', 400, 'INVALID_DONOR_ID');
  }
  return eligibilityService.calculateEligibility(String(donor_id).trim(), component);
}

/**
 * 3. manage_inventory()
 * Boundary gaps: Zero quantity or stock at configured threshold
 * Error path gaps: Invalid blood group, component, or dates
 * Domain constraint gaps: Collection date must precede or equal expiry date
 * Specification addition: Enforces quantity limits, date validation, and low-stock behavior
 */
async function manage_inventory(blood_bank_id, unit_data, user) {
  if (!blood_bank_id) throw new AppError('blood_bank_id is required', 400, 'INVALID_BANK_ID');
  const staff = user || { userId: blood_bank_id, role: 'BLOOD_BANK_STAFF' };
  return inventoryService.trackBloodUnit(blood_bank_id, unit_data, staff);
}

/**
 * 4. create_emergency_request()
 * Boundary gaps: Zero units or required-by time at or before the current time
 * Error path gaps: Missing fields or invalid request data
 * Domain constraint gaps: Valid blood group, component, urgency, and location
 * Specification addition: Validates required fields, quantity limits, and future required-by time
 */
async function create_emergency_request(request_data, user) {
  const reqUser = user || { userId: request_data.hospital_id || 'USR-HOSP-01', role: 'HOSPITAL' };
  return requestService.createBloodRequest(request_data, reqUser);
}

/**
 * 5. match_blood_and_donors()
 * Boundary gaps: No compatible stock or eligible donors
 * Error path gaps: Missing inventory or donor data
 * Domain constraint gaps: Separate RBC/plasma compatibility and donor eligibility rules
 * Specification addition: Matching rules, ranking criteria (exact match, distance, interval, response), and privacy protection
 */
async function match_blood_and_donors(request_id, location = {}, requesting_user = null) {
  if (!request_id) throw new AppError('request_id is required', 400, 'INVALID_REQUEST_ID');
  const request = await requestService.getRequestById(request_id);
  const ranked = await requestService.rankEligibleDonors(
    request.blood_group,
    request.component,
    location,
    requesting_user
  );
  return {
    request_id: request.req_id,
    blood_group: request.blood_group,
    component: request.component,
    matched_donors: ranked,
    count: ranked.length
  };
}

/**
 * 6. reserve_blood_stock()
 * Boundary gaps: Requested quantity equals available stock or exceeds it
 * Error path gaps: Concurrent reservation or insufficient stock
 * Domain constraint gaps: No expired stock, no double allocation, compatibility pass
 * Specification addition: Atomic PostgreSQL transaction with row-level locks (SELECT ... FOR UPDATE) and rollback
 */
async function reserve_blood_stock(request_id, blood_bank_id, blood_unit_id, requested_units, staff_user) {
  const user = staff_user || { userId: blood_bank_id, role: 'BLOOD_BANK_STAFF' };
  return reservationService.reserveAndFulfillBloodRequest(
    request_id,
    blood_bank_id,
    blood_unit_id,
    requested_units,
    user
  );
}

/**
 * 7. escalate_request()
 * Boundary gaps: Escalation interval reached exactly
 * Error path gaps: No eligible donors or partial fulfillment
 * Domain constraint gaps: Critical-request escalation rules
 * Specification addition: Escalation timing, partial fulfillment, and status transition to 'ESCALATED'
 */
async function escalate_request(request_id, user) {
  if (!request_id) throw new AppError('request_id is required', 400, 'INVALID_REQUEST_ID');
  const actingUser = user || { userId: 'USR-STAFF-01', role: 'BLOOD_BANK_STAFF' };
  return requestService.escalateRequest(request_id, actingUser);
}

/**
 * 8. book_donation_slot()
 * Boundary gaps: Last available slot or full capacity
 * Error path gaps: Duplicate booking or ineligible donor
 * Domain constraint gaps: Donor eligibility and slot capacity
 * Specification addition: Booking limits, eligibility checks, and overbooking prevention via atomic row lock
 */
async function book_donation_slot(booking_data, user) {
  const actingUser = user || { userId: booking_data.donor_id, role: 'DONOR' };
  return driveService.bookDonationSlot(booking_data, actingUser);
}

/**
 * 9. transfer_blood_stock()
 * Boundary gaps: Transfer quantity equals available stock
 * Error path gaps: Invalid destination or failed transfer
 * Domain constraint gaps: Compatible stock, valid expiry, and sufficient quantity
 * Specification addition: Atomic transfer validation, destination insertion, and rollback on failure
 */
async function transfer_blood_stock(source_bank_id, target_bank_id, blood_unit_id, transfer_units, user) {
  const actingUser = user || { userId: source_bank_id, role: 'BLOOD_BANK_STAFF' };
  return inventoryService.transferBloodStock(
    source_bank_id,
    target_bank_id,
    blood_unit_id,
    transfer_units,
    actingUser
  );
}

/**
 * 10. generate_reports()
 * Boundary gaps: Empty date range or no records
 * Error path gaps: Invalid filters or export failure
 * Domain constraint gaps: Authorized access to sensitive data (Admin & Blood Bank Staff only)
 * Specification addition: Filter limits, CSV format generation, and access permissions
 */
async function generate_reports(report_type = 'DASHBOARD', start_date = null, end_date = null, user_role = 'ADMIN', format = 'JSON') {
  return reportService.generateSystemReport(report_type, start_date, end_date, user_role, format);
}

module.exports = {
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
};
