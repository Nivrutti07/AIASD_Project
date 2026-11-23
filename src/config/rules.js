// =========================================================================
// Deterministic Domain Rules & Compatibility Matrices (FR-03, FR-07, etc.)
// =========================================================================

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENTS = ['WHOLE_BLOOD', 'RBC', 'PLASMA', 'PLATELETS'];
const REQUEST_STATUSES = ['PENDING', 'MATCHED', 'RESERVED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED', 'ESCALATED'];
const URGENCY_LEVELS = ['NORMAL', 'URGENT', 'CRITICAL'];
const USER_ROLES = ['DONOR', 'HOSPITAL', 'PATIENT', 'BLOOD_BANK_STAFF', 'ADMIN'];

// Default eligibility rules (can be customized via system_rules in DB)
const DEFAULT_ELIGIBILITY_RULES = {
  minAge: 18,
  maxAge: 65,
  minWeightKg: 50.0,
  minDonationIntervalDays: {
    WHOLE_BLOOD: 90,
    RBC: 112, // Double red cells
    PLASMA: 28,
    PLATELETS: 14
  },
  defaultIntervalDays: 90
};

// Red Blood Cells (RBC) & Whole Blood Compatibility Matrix
// Recipient -> Array of Compatible Donor Blood Groups
const RBC_COMPATIBILITY_MATRIX = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']
};

// Plasma Compatibility Matrix
// In Plasma, AB is universal DONOR, O is universal RECIPIENT
// Recipient -> Array of Compatible Donor Blood Groups
const PLASMA_COMPATIBILITY_MATRIX = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'],
  'A+': ['A-', 'A+', 'AB-', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'],
  'B+': ['B-', 'B+', 'AB-', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB-', 'AB+']
};

// Platelets Compatibility Matrix
const PLATELETS_COMPATIBILITY_MATRIX = {
  'O-': ['O-', 'O+'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'A+', 'O-', 'O+'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'B+', 'O-', 'O+'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'AB+', 'A-', 'A+', 'B-', 'B+', 'O-', 'O+'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-']
};

// Default stock thresholds (low stock alert)
const DEFAULT_STOCK_THRESHOLDS = {
  lowStockThreshold: 5,
  criticalStockThreshold: 2
};

// Default escalation times (in hours)
const DEFAULT_ESCALATION_HOURS = {
  CRITICAL: 2, // 2 hours
  URGENT: 6,   // 6 hours
  NORMAL: 24   // 24 hours
};

module.exports = {
  BLOOD_GROUPS,
  COMPONENTS,
  REQUEST_STATUSES,
  URGENCY_LEVELS,
  USER_ROLES,
  DEFAULT_ELIGIBILITY_RULES,
  RBC_COMPATIBILITY_MATRIX,
  PLASMA_COMPATIBILITY_MATRIX,
  PLATELETS_COMPATIBILITY_MATRIX,
  DEFAULT_STOCK_THRESHOLDS,
  DEFAULT_ESCALATION_HOURS
};
