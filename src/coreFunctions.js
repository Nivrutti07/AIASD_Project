// =========================================================================
// Blood Donation and Emergency Request System - Core Gap Analysis Functions
// Directly exports the 10 functions specified in the Gap Analysis Record:
//   1. register_donor()         -> src/modules/donor/donor.service.js
//   2. calculate_eligibility()  -> src/modules/eligibility/eligibility.service.js
//   3. manage_inventory()       -> src/modules/inventory/inventory.service.js
//   4. create_emergency_request() -> src/modules/emergency_request/request.service.js
//   5. match_blood_and_donors() -> src/modules/emergency_request/request.service.js
//   6. reserve_blood_stock()    -> src/modules/reservation/reservation.service.js
//   7. escalate_request()       -> src/modules/emergency_request/request.service.js
//   8. book_donation_slot()     -> src/modules/donation_drive/drive.service.js
//   9. transfer_blood_stock()   -> src/modules/inventory/inventory.service.js
//  10. generate_reports()       -> src/modules/reporting_audit/report.service.js
// =========================================================================

const donorService = require('./modules/donor/donor.service');
const eligibilityService = require('./modules/eligibility/eligibility.service');
const inventoryService = require('./modules/inventory/inventory.service');
const requestService = require('./modules/emergency_request/request.service');
const reservationService = require('./modules/reservation/reservation.service');
const driveService = require('./modules/donation_drive/drive.service');
const reportService = require('./modules/reporting_audit/report.service');

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
