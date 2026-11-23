const donorService = require('./donor.service');

class DonorController {
  async getDonor(req, res, next) {
    try {
      const { donor_id } = req.params;
      const donor = await donorService.getDonorById(donor_id, req.user);
      return res.status(200).json({
        success: true,
        data: donor
      });
    } catch (err) {
      next(err);
    }
  }

  async updateDonor(req, res, next) {
    try {
      const { donor_id } = req.params;
      const updated = await donorService.manageDonor(donor_id, req.body, req.user);
      return res.status(200).json({
        success: true,
        message: 'Donor profile updated successfully',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  async listDonors(req, res, next) {
    try {
      const { blood_group, is_available, city } = req.query;
      const donors = await donorService.listDonors(
        {
          bloodGroup: blood_group,
          isAvailable: is_available !== undefined ? is_available === 'true' : undefined,
          city
        },
        req.user
      );
      return res.status(200).json({
        success: true,
        data: donors
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DonorController();
