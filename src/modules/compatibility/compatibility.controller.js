const compatibilityService = require('./compatibility.service');

class CompatibilityController {
  check(req, res, next) {
    try {
      const { donor_group, recipient_group, component } = req.body;
      const isCompatible = compatibilityService.checkCompatibility(donor_group, recipient_group, component);
      return res.status(200).json({
        success: true,
        data: {
          donor_group,
          recipient_group,
          component: component || 'RBC',
          compatible: isCompatible
        }
      });
    } catch (err) {
      next(err);
    }
  }

  getCompatibleDonors(req, res, next) {
    try {
      const { recipient_group, component } = req.query;
      const compatibleGroups = compatibilityService.getCompatibleDonorGroups(recipient_group, component);
      return res.status(200).json({
        success: true,
        data: {
          recipient_group,
          component: component || 'RBC',
          compatible_donor_groups: compatibleGroups
        }
      });
    } catch (err) {
      next(err);
    }
  }

  getMatrices(req, res, next) {
    try {
      const matrices = compatibilityService.getAllMatrices();
      return res.status(200).json({
        success: true,
        data: matrices
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CompatibilityController();
