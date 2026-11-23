-- =========================================================================
-- Blood Donation and Emergency Request System - Database Schema (PostgreSQL)
-- Team Members:
--   - Kedar Nimbalkar (Roll: 323, USN: 01FE24BCS159)
--   - Nivrutti Patil (Roll: 332, USN: 01FE24BCS168)
--   - Sanskruti Agasgekar (Roll: 333, USN: 01FE24BCS169)
--   - Shreya Pavaskar (Roll: 335, USN: 01FE24BCS171)
-- =========================================================================

-- Drop tables in reverse dependency order if rebuilding
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS slot_bookings CASCADE;
DROP TABLE IF EXISTS donation_drives CASCADE;
DROP TABLE IF EXISTS donates CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS blood_request CASCADE;
DROP TABLE IF EXISTS blood_unit CASCADE;
DROP TABLE IF EXISTS admits CASCADE;
DROP TABLE IF EXISTS donor CASCADE;
DROP TABLE IF EXISTS blood_bank CASCADE;
DROP TABLE IF EXISTS patient CASCADE;
DROP TABLE IF EXISTS hospital CASCADE;
DROP TABLE IF EXISTS system_rules CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Base Users Table (Supertype for disjoint ISA hierarchy)
CREATE TABLE users (
    user_id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('DONOR', 'HOSPITAL', 'PATIENT', 'BLOOD_BANK_STAFF', 'ADMIN')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Hospital Table (ISA Subtype)
CREATE TABLE hospital (
    hospital_id VARCHAR(50) PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    address VARCHAR(255),
    contact_person VARCHAR(100)
);

-- 3. Patient Table (ISA Subtype)
CREATE TABLE patient (
    patient_id VARCHAR(50) PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    age INT NOT NULL CHECK (age >= 0 AND age <= 130),
    contact VARCHAR(50),
    blood_group VARCHAR(10) NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'))
);

-- 4. Blood Bank Table (ISA Subtype)
CREATE TABLE blood_bank (
    blood_bank_id VARCHAR(50) PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    line1 VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20),
    contact_phone VARCHAR(30)
);

-- 5. Donor Table (ISA Subtype)
CREATE TABLE donor (
    donor_id VARCHAR(50) PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    blood_group VARCHAR(10) NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    age INT NOT NULL CHECK (age >= 16 AND age <= 100),
    weight NUMERIC(5, 2) NOT NULL CHECK (weight > 0),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    last_donation_date DATE,
    deferral_until DATE,
    medical_history TEXT,
    total_donations INT DEFAULT 0 CHECK (total_donations >= 0),
    response_rate NUMERIC(4, 2) DEFAULT 1.00 CHECK (response_rate >= 0.0 AND response_rate <= 1.0),
    is_available BOOLEAN DEFAULT TRUE
);

-- 6. Admits Table (M:N Relationship between Hospital and Patient)
CREATE TABLE admits (
    admission_id VARCHAR(50) PRIMARY KEY,
    hospital_id VARCHAR(50) NOT NULL REFERENCES hospital(hospital_id) ON DELETE CASCADE,
    patient_id VARCHAR(50) NOT NULL REFERENCES patient(patient_id) ON DELETE CASCADE,
    admission_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(30) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISCHARGED', 'TRANSFERRED')),
    room_no VARCHAR(50)
);

-- 7. Blood Unit Table (Weak Entity: Blood Bank 1:N Blood Unit with composite key)
CREATE TABLE blood_unit (
    blood_bank_id VARCHAR(50) NOT NULL REFERENCES blood_bank(blood_bank_id) ON DELETE CASCADE,
    blood_unit_id VARCHAR(50) NOT NULL,
    blood_group VARCHAR(10) NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    component VARCHAR(30) NOT NULL CHECK (component IN ('WHOLE_BLOOD', 'RBC', 'PLASMA', 'PLATELETS')),
    quantity INT NOT NULL CHECK (quantity >= 0),
    collection_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    status VARCHAR(30) DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'RESERVED', 'TRANSFERRED', 'DISCARDED')),
    CONSTRAINT blood_unit_pk PRIMARY KEY (blood_bank_id, blood_unit_id),
    CONSTRAINT chk_unit_dates CHECK (collection_date <= expiry_date)
);

-- 8. Blood Request Table (Emergency and Normal Blood Requests)
CREATE TABLE blood_request (
    req_id VARCHAR(50) PRIMARY KEY,
    hospital_id VARCHAR(50) REFERENCES hospital(hospital_id) ON DELETE SET NULL,
    patient_id VARCHAR(50) REFERENCES patient(patient_id) ON DELETE SET NULL,
    blood_bank_id VARCHAR(50) REFERENCES blood_bank(blood_bank_id) ON DELETE SET NULL,
    blood_group VARCHAR(10) NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    component VARCHAR(30) NOT NULL CHECK (component IN ('WHOLE_BLOOD', 'RBC', 'PLASMA', 'PLATELETS')),
    quantity INT NOT NULL CHECK (quantity > 0),
    fulfilled_quantity INT DEFAULT 0 CHECK (fulfilled_quantity >= 0),
    urgency VARCHAR(20) NOT NULL CHECK (urgency IN ('NORMAL', 'URGENT', 'CRITICAL')),
    status VARCHAR(30) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'MATCHED', 'RESERVED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED', 'ESCALATED')),
    required_by TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Reservations Table (Stock reservation preventing double allocation)
CREATE TABLE reservations (
    reservation_id VARCHAR(50) PRIMARY KEY,
    req_id VARCHAR(50) NOT NULL REFERENCES blood_request(req_id) ON DELETE CASCADE,
    blood_bank_id VARCHAR(50) NOT NULL,
    blood_unit_id VARCHAR(50) NOT NULL,
    reserved_units INT NOT NULL CHECK (reserved_units > 0),
    reserved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(30) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FULFILLED', 'RELEASED', 'EXPIRED')),
    CONSTRAINT fk_res_blood_unit FOREIGN KEY (blood_bank_id, blood_unit_id) REFERENCES blood_unit(blood_bank_id, blood_unit_id) ON DELETE CASCADE
);

-- 10. Donates / Donations Table (M:N Relationship between Donor and Blood Bank)
CREATE TABLE donates (
    donation_id VARCHAR(50) PRIMARY KEY,
    donor_id VARCHAR(50) NOT NULL REFERENCES donor(donor_id) ON DELETE CASCADE,
    blood_bank_id VARCHAR(50) NOT NULL REFERENCES blood_bank(blood_bank_id) ON DELETE CASCADE,
    donation_date DATE NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    blood_group VARCHAR(10) NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    component VARCHAR(30) NOT NULL CHECK (component IN ('WHOLE_BLOOD', 'RBC', 'PLASMA', 'PLATELETS')),
    status VARCHAR(30) DEFAULT 'COMPLETED' CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'DEFERRED'))
);

-- 11. Donation Drives Table (Organized by Blood Banks)
CREATE TABLE donation_drives (
    drive_id VARCHAR(50) PRIMARY KEY,
    blood_bank_id VARCHAR(50) NOT NULL REFERENCES blood_bank(blood_bank_id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    location VARCHAR(255) NOT NULL,
    drive_date DATE NOT NULL,
    start_time VARCHAR(20) NOT NULL,
    end_time VARCHAR(20) NOT NULL,
    capacity INT NOT NULL CHECK (capacity > 0),
    booked_count INT DEFAULT 0 CHECK (booked_count >= 0),
    status VARCHAR(30) DEFAULT 'ACTIVE' CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT chk_drive_capacity CHECK (booked_count <= capacity)
);

-- 12. Slot Bookings Table (Donors booking slots in Donation Drives)
CREATE TABLE slot_bookings (
    booking_id VARCHAR(50) PRIMARY KEY,
    drive_id VARCHAR(50) NOT NULL REFERENCES donation_drives(drive_id) ON DELETE CASCADE,
    donor_id VARCHAR(50) NOT NULL REFERENCES donor(donor_id) ON DELETE CASCADE,
    slot_time VARCHAR(20) NOT NULL,
    status VARCHAR(30) DEFAULT 'BOOKED' CHECK (status IN ('BOOKED', 'ATTENDED', 'CANCELLED', 'NO_SHOW')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_drive_donor UNIQUE (drive_id, donor_id)
);

-- 13. System Rules Table (Configurable eligibility, thresholds, and timers)
CREATE TABLE system_rules (
    rule_key VARCHAR(50) PRIMARY KEY,
    rule_value TEXT NOT NULL,
    description VARCHAR(255),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. Audit Logs Table (Immutable audit trail for compliance and tracking)
CREATE TABLE audit_logs (
    log_id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    entity_name VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50),
    details TEXT,
    ip_address VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance and quick lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_blood_unit_group_comp ON blood_unit(blood_group, component, status, expiry_date);
CREATE INDEX idx_blood_request_status ON blood_request(status, urgency, required_by);
CREATE INDEX idx_donor_bg_avail ON donor(blood_group, is_available, deferral_until);
CREATE INDEX idx_reservations_req ON reservations(req_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
