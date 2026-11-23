const inventoryService = require('./inventory.service');

class InventoryController {
  async trackUnit(req, res, next) {
    try {
      const bloodBankId = req.params.blood_bank_id || req.user.userId;
      const unit = await inventoryService.trackBloodUnit(bloodBankId, req.body, req.user);
      return res.status(201).json({
        success: true,
        message: 'Blood unit tracked successfully',
        data: unit
      });
    } catch (err) {
      next(err);
    }
  }

  async checkStatus(req, res, next) {
    try {
      const { blood_bank_id, unit_id } = req.params;
      const status = await inventoryService.checkInventoryStatus(blood_bank_id, unit_id);
      return res.status(200).json({
        success: true,
        data: status
      });
    } catch (err) {
      next(err);
    }
  }

  async listInventory(req, res, next) {
    try {
      const { blood_bank_id, blood_group, component, status } = req.query;
      const result = await inventoryService.listInventory(
        {
          bloodBankId: blood_bank_id,
          bloodGroup: blood_group,
          component,
          status
        },
        req.user
      );
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async transferStock(req, res, next) {
    try {
      const { source_bank_id, target_bank_id, blood_unit_id, units } = req.body;
      const result = await inventoryService.transferBloodStock(
        source_bank_id,
        target_bank_id,
        blood_unit_id,
        units,
        req.user
      );
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new InventoryController();
