const donorRepository = require('./donor.repository');
const { AppError } = require('../../middleware/errorHandler');
const { sanitizeDonorForRequester } = require('../../middleware/auth');
const { BLOOD_GROUPS } = require('../../config/rules');

class DonorService {
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

module.exports = new DonorService();
