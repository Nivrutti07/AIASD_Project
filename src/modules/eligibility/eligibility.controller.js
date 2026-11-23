const eligibilityService = require('./eligibility.service');

class EligibilityController {
  async getDonorEligibility(req, res, next) {
    try {
      const { donor_id } = req.params;
      const { component } = req.query;
      const status = await eligibilityService.calculateEligibility(donor_id, component || 'WHOLE_BLOOD');
      return res.status(200).json({
        success: true,
        data: status
      });
    } catch (err) {
      next(err);
    }
  }

  async evaluateCustomDonor(req, res, next) {
    try {
      const { donor, component } = req.body;
      const status = eligibilityService.evaluateRules(donor, component || 'WHOLE_BLOOD');
      return res.status(200).json({
        success: true,
        data: status
      });
    } catch (err) {
      next(err);
    }
  }

  async getActiveRules(req, res, next) {
    try {
      const rules = await eligibilityService.getActiveRules();
      return res.status(200).json({
        success: true,
        data: rules
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new EligibilityController();
