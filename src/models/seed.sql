-- =========================================================================
-- Seed Data for Blood Donation and Emergency Request System
-- Pre-populated users, hospitals, blood banks, donors, patients, blood units,
-- donation drives, requests, and system rules.
--
-- Password for all seed users is 'Password123!'
-- Hashed with bcryptjs: '$2b$10$IQUC6rqLOk1BCOE4hRj3dOddOwTnXQfqrFBxSHVgm6jY85u39ktze'
-- =========================================================================

-- System Rules
INSERT INTO system_rules (rule_key, rule_value, description) VALUES
('ELIGIBILITY_MIN_AGE', '18', 'Minimum donor age in years'),
('ELIGIBILITY_MAX_AGE', '65', 'Maximum donor age in years'),
('ELIGIBILITY_MIN_WEIGHT', '50.0', 'Minimum donor weight in kilograms'),
('DONATION_INTERVAL_WHOLE_BLOOD', '90', 'Interval between whole blood donations in days'),
('DONATION_INTERVAL_PLASMA', '28', 'Interval between plasma donations in days'),
('DONATION_INTERVAL_PLATELETS', '14', 'Interval between platelet donations in days'),
('LOW_STOCK_THRESHOLD', '5', 'Minimum units before low stock alert is triggered'),
('CRITICAL_STOCK_THRESHOLD', '2', 'Stock units considered critical deficiency'),
('ESCALATION_TIMER_CRITICAL_HOURS', '2', 'Max hours before CRITICAL request escalates'),
('ESCALATION_TIMER_URGENT_HOURS', '6', 'Max hours before URGENT request escalates')
ON CONFLICT (rule_key) DO NOTHING;

-- Users (ISA Supertype)
-- Password is 'Password123!'
INSERT INTO users (user_id, email, password_hash, phone, role) VALUES
('USR-ADMIN-01', 'admin@bloodconnect.org', '$2b$10$IQUC6rqLOk1BCOE4hRj3dOddOwTnXQfqrFBxSHVgm6jY85u39ktze', '+919876543210', 'ADMIN'),
('USR-STAFF-01', 'staff.central@bloodconnect.org', '$2b$10$IQUC6rqLOk1BCOE4hRj3dOddOwTnXQfqrFBxSHVgm6jY85u39ktze', '+919876543211', 'BLOOD_BANK_STAFF'),
('USR-STAFF-02', 'staff.metro@bloodconnect.org', '$2b$10$IQUC6rqLOk1BCOE4hRj3dOddOwTnXQfqrFBxSHVgm6jY85u39ktze', '+919876543212', 'BLOOD_BANK_STAFF'),
('USR-HOSP-01', 'emergency@cityhospital.org', '$2b$10$IQUC6rqLOk1BCOE4hRj3dOddOwTnXQfqrFBxSHVgm6jY85u39ktze', '+919876543213', 'HOSPITAL'),
('USR-HOSP-02', 'er@apollomedical.org', '$2b$10$IQUC6rqLOk1BCOE4hRj3dOddOwTnXQfqrFBxSHVgm6jY85u39ktze', '+919876543214', 'HOSPITAL'),
('USR-PAT-01', 'patient.rahul@gmail.com', '$2b$10$IQUC6rqLOk1BCOE4hRj3dOddOwTnXQfqrFBxSHVgm6jY85u39ktze', '+919876543215', 'PATIENT'),
('USR-DONOR-01', 'donor.arun@gmail.com', '$2b$10$IQUC6rqLOk1BCOE4hRj3dOddOwTnXQfqrFBxSHVgm6jY85u39ktze', '+919876543216', 'DONOR'),
('USR-DONOR-02', 'donor.priya@gmail.com', '$2b$10$IQUC6rqLOk1BCOE4hRj3dOddOwTnXQfqrFBxSHVgm6jY85u39ktze', '+919876543217', 'DONOR'),
('USR-DONOR-03', 'donor.rohit@gmail.com', '$2b$10$IQUC6rqLOk1BCOE4hRj3dOddOwTnXQfqrFBxSHVgm6jY85u39ktze', '+919876543218', 'DONOR'),
('USR-DONOR-04', 'donor.ananya@gmail.com', '$2b$10$IQUC6rqLOk1BCOE4hRj3dOddOwTnXQfqrFBxSHVgm6jY85u39ktze', '+919876543219', 'DONOR')
ON CONFLICT (user_id) DO NOTHING;

-- Blood Bank (ISA Subtype)
INSERT INTO blood_bank (blood_bank_id, name, line1, city, state, postal_code, contact_phone) VALUES
('USR-STAFF-01', 'Central Red Cross Blood Bank', 'Station Road, 102', 'Hubli', 'Karnataka', '580020', '+919876543211'),
('USR-STAFF-02', 'Metro LifeBlood Center', 'Civil Lines, 45', 'Dharwad', 'Karnataka', '580001', '+919876543212')
ON CONFLICT (blood_bank_id) DO NOTHING;

-- Hospital (ISA Subtype)
INSERT INTO hospital (hospital_id, name, address, contact_person) VALUES
('USR-HOSP-01', 'Hubli City Civil Hospital', 'Vidyanagar, Hubli', 'Dr. Ramesh Kulkarni'),
('USR-HOSP-02', 'Apollo Super Speciality Hospital', 'PB Road, Dharwad', 'Dr. Sneha Desai')
ON CONFLICT (hospital_id) DO NOTHING;

-- Patient (ISA Subtype)
INSERT INTO patient (patient_id, name, age, contact, blood_group) VALUES
('USR-PAT-01', 'Rahul Sharma', 32, '+919876543215', 'O+')
ON CONFLICT (patient_id) DO NOTHING;

-- Donor (ISA Subtype)
INSERT INTO donor (donor_id, name, blood_group, age, weight, city, state, last_donation_date, deferral_until, medical_history, total_donations, response_rate, is_available) VALUES
('USR-DONOR-01', 'Arun Kumar', 'O-', 28, 72.5, 'Hubli', 'Karnataka', '2026-08-01', NULL, 'None. Regular universal donor.', 5, 0.95, TRUE),
('USR-DONOR-02', 'Priya Joshi', 'O+', 24, 58.0, 'Hubli', 'Karnataka', '2026-07-15', NULL, 'No complications.', 3, 0.90, TRUE),
('USR-DONOR-03', 'Rohit Verma', 'A+', 35, 68.0, 'Dharwad', 'Karnataka', '2026-05-10', NULL, 'None.', 4, 0.85, TRUE),
('USR-DONOR-04', 'Ananya Hegde', 'B+', 22, 54.0, 'Hubli', 'Karnataka', NULL, NULL, 'First time donor.', 0, 1.00, TRUE)
ON CONFLICT (donor_id) DO NOTHING;

-- Admits (Hospital admits Patient)
INSERT INTO admits (admission_id, hospital_id, patient_id, admission_date, status, room_no) VALUES
('ADM-001', 'USR-HOSP-01', 'USR-PAT-01', CURRENT_TIMESTAMP, 'ACTIVE', 'ICU-04')
ON CONFLICT (admission_id) DO NOTHING;

-- Blood Units (Weak entity: blood_bank_id + blood_unit_id)
INSERT INTO blood_unit (blood_bank_id, blood_unit_id, blood_group, component, quantity, collection_date, expiry_date, status) VALUES
('USR-STAFF-01', 'UNIT-O-NEG-001', 'O-', 'RBC', 4, '2026-11-10', '2026-12-22', 'AVAILABLE'),
('USR-STAFF-01', 'UNIT-O-POS-001', 'O+', 'RBC', 10, '2026-11-12', '2026-12-24', 'AVAILABLE'),
('USR-STAFF-01', 'UNIT-A-POS-001', 'A+', 'RBC', 8, '2026-11-05', '2026-12-17', 'AVAILABLE'),
('USR-STAFF-01', 'UNIT-B-POS-001', 'B+', 'PLASMA', 6, '2026-11-01', '2027-11-01', 'AVAILABLE'),
('USR-STAFF-01', 'UNIT-AB-POS-001', 'AB+', 'PLASMA', 5, '2026-11-01', '2027-11-01', 'AVAILABLE'),
('USR-STAFF-02', 'UNIT-O-NEG-002', 'O-', 'RBC', 2, '2026-11-15', '2026-12-27', 'AVAILABLE'),
('USR-STAFF-02', 'UNIT-O-POS-002', 'O+', 'WHOLE_BLOOD', 7, '2026-11-18', '2026-12-23', 'AVAILABLE')
ON CONFLICT (blood_bank_id, blood_unit_id) DO NOTHING;

-- Donation Drives
INSERT INTO donation_drives (drive_id, blood_bank_id, title, location, drive_date, start_time, end_time, capacity, booked_count, status) VALUES
('DRV-2026-001', 'USR-STAFF-01', 'Hubli IT Park Blood Donation Camp', 'IT Park Main Atrium, Hubli', '2026-12-05', '09:00', '17:00', 50, 2, 'ACTIVE'),
('DRV-2026-002', 'USR-STAFF-02', 'KLE Tech University Donation Drive', 'Campus Health Center, Vidyanagar', '2026-12-12', '10:00', '16:00', 40, 0, 'ACTIVE')
ON CONFLICT (drive_id) DO NOTHING;

-- Slot Bookings
INSERT INTO slot_bookings (booking_id, drive_id, donor_id, slot_time, status) VALUES
('BKG-001', 'DRV-2026-001', 'USR-DONOR-01', '10:30', 'BOOKED'),
('BKG-002', 'DRV-2026-001', 'USR-DONOR-02', '11:00', 'BOOKED')
ON CONFLICT (booking_id) DO NOTHING;

-- Blood Request
INSERT INTO blood_request (req_id, hospital_id, patient_id, blood_bank_id, blood_group, component, quantity, fulfilled_quantity, urgency, status, required_by) VALUES
('REQ-2026-001', 'USR-HOSP-01', 'USR-PAT-01', 'USR-STAFF-01', 'O+', 'RBC', 2, 0, 'CRITICAL', 'PENDING', CURRENT_TIMESTAMP + INTERVAL '4 hours')
ON CONFLICT (req_id) DO NOTHING;

-- Audit Log
INSERT INTO audit_logs (log_id, user_id, action, entity_name, entity_id, details) VALUES
('LOG-0001', 'USR-ADMIN-01', 'SYSTEM_INITIALIZATION', 'SYSTEM', 'SYSTEM', 'Initial system seed and database configuration complete.')
ON CONFLICT (log_id) DO NOTHING;
