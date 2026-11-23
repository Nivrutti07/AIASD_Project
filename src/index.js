// =========================================================================
// Blood Donation and Emergency Request System - Application Root & Business Logic Hub
// Central export for the 10 Gap Analysis Record functions & modular services:
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

const app = require('./app');
const db = require('./config/database');

// Domain Services (Business Logic Layer)
const authService = require('./modules/auth/auth.service');
const donorService = require('./modules/donor/donor.service');
const eligibilityService = require('./modules/eligibility/eligibility.service');
const inventoryService = require('./modules/inventory/inventory.service');
const compatibilityService = require('./modules/compatibility/compatibility.service');
const requestService = require('./modules/emergency_request/request.service');
const reservationService = require('./modules/reservation/reservation.service');
const driveService = require('./modules/donation_drive/drive.service');
const reportService = require('./modules/reporting_audit/report.service');

// 10 Core Gap Analysis Business Logic Functions
const register_donor = donorService.register_donor;
const calculate_eligibility = eligibilityService.calculate_eligibility;
const manage_inventory = inventoryService.manage_inventory;
const create_emergency_request = requestService.create_emergency_request;
const match_blood_and_donors = requestService.match_blood_and_donors;
const reserve_blood_stock = reservationService.reserve_blood_stock;
const escalate_request = requestService.escalate_request;
const book_donation_slot = driveService.book_donation_slot;
const transfer_blood_stock = inventoryService.transfer_blood_stock;
const generate_reports = reportService.generate_reports;

module.exports = {
  // Express app & database
  app,
  db,

  // 10 Essential Business Logic Functions
  register_donor,
  calculate_eligibility,
  manage_inventory,
  create_emergency_request,
  match_blood_and_donors,
  reserve_blood_stock,
  escalate_request,
  book_donation_slot,
  transfer_blood_stock,
  generate_reports,

  // Domain Services
  authService,
  donorService,
  eligibilityService,
  inventoryService,
  compatibilityService,
  requestService,
  reservationService,
  driveService,
  reportService
};
