const donorRepository = require('./donor.repository');
const authService = require('../auth/auth.service');
const { AppError } = require('../../middleware/errorHandler');
const { sanitizeDonorForRequester } = require('../../middleware/auth');
const { BLOOD_GROUPS } = require('../../config/rules');

class DonorService {
  /**
   * 1. register_donor()
   * Gap Analysis:
   * Boundary gaps: Empty or maximum-length fields
   * Error path gaps: Duplicate account or invalid input
   * Domain constraint gaps: Valid age, weight, and required donor details
   * Specification addition: Enforces field limits, validation, and duplicate-registration prevention
   */
  async register_donor(donorData = {}, credentials = {}) {
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
   * FR-02: manage_donor(donor_id: str, ...) -> Donor
   */
  async manageDonor(donorId, updateData, requestingUser) {
    const existing = await donorRepository.findById(donorId);
    if (!existing) {
      throw new AppError(`Donor with id '${donorId}' not found`, 404, 'DONOR_NOT_FOUND');
    }

    // Role check: Only donor themselves, blood bank staff, or admin can update
    if (
      requestingUser.role === 'DONOR' && requestingUser.userId !== donorId
    ) {
      throw new AppError('Unauthorized: Donors can only update their own profile', 403, 'FORBIDDEN');
    }
    if (requestingUser.role === 'HOSPITAL' || requestingUser.role === 'PATIENT') {
      throw new AppError('Unauthorized: Requesters cannot modify donor records', 403, 'FORBIDDEN');
    }

    // Validation checks
    if (updateData.age !== undefined && (updateData.age < 16 || updateData.age > 100)) {
      throw new AppError('Donor age must be between 16 and 100', 400, 'INVALID_AGE');
    }

    if (updateData.weight !== undefined && updateData.weight <= 0) {
      throw new AppError('Donor weight must be greater than 0 kg', 400, 'INVALID_WEIGHT');
    }

    if (updateData.bloodGroup && !BLOOD_GROUPS.includes(updateData.bloodGroup)) {
      throw new AppError(`Invalid blood group: '${updateData.bloodGroup}'`, 400, 'INVALID_BLOOD_GROUP');
    }

    const updated = await donorRepository.updateProfile(donorId, updateData);
    return updated;
  }

  async getDonorById(donorId, requestingUser) {
    const donor = await donorRepository.findById(donorId);
    if (!donor) {
      throw new AppError(`Donor with id '${donorId}' not found`, 404, 'DONOR_NOT_FOUND');
    }

    // Privacy Protection Rule:
    // If requestingUser is a HOSPITAL or PATIENT, strip phone and medical history!
    if (requestingUser && (requestingUser.role === 'HOSPITAL' || requestingUser.role === 'PATIENT')) {
      return sanitizeDonorForRequester(donor);
    }

    return donor;
  }

  async listDonors(filters, requestingUser) {
    const donors = await donorRepository.listDonors(filters);

    if (requestingUser && (requestingUser.role === 'HOSPITAL' || requestingUser.role === 'PATIENT')) {
      return donors.map(d => sanitizeDonorForRequester(d));
    }

    return donors;
  }
}

const donorService = new DonorService();
donorService.register_donor = donorService.register_donor.bind(donorService);
module.exports = donorService;
module.exports.register_donor = donorService.register_donor;
