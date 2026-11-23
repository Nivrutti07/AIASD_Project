const inventoryRepository = require('./inventory.repository');
const db = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');
const { BLOOD_GROUPS, COMPONENTS, DEFAULT_STOCK_THRESHOLDS } = require('../../config/rules');

class InventoryService {
  /**
   * 3. manage_inventory()
   * Gap Analysis:
   * Boundary gaps: Zero quantity or stock at configured threshold
   * Error path gaps: Invalid blood group, component, or dates
   * Domain constraint gaps: Collection date must precede expiry date
   * Specification addition: Enforces quantity limits, date validation, and low-stock behavior
   */
  async manage_inventory(blood_bank_id, unit_data, user) {
    if (!blood_bank_id) throw new AppError('blood_bank_id is required', 400, 'INVALID_BANK_ID');
    const staff = user || { userId: blood_bank_id, role: 'BLOOD_BANK_STAFF' };
    return this.trackBloodUnit(blood_bank_id, unit_data, staff);
  }

  /**
   * 9. transfer_blood_stock()
   * Gap Analysis:
   * Boundary gaps: Transfer quantity equals available stock
   * Error path gaps: Invalid destination or failed transfer
   * Domain constraint gaps: Compatible stock, valid expiry, and sufficient quantity
   * Specification addition: Atomic transfer validation, destination insertion, and rollback on failure
   */
  async transfer_blood_stock(source_bank_id, target_bank_id, blood_unit_id, transfer_units, user) {
    const actingUser = user || { userId: source_bank_id, role: 'BLOOD_BANK_STAFF' };
    return this.transferBloodStock(source_bank_id, target_bank_id, blood_unit_id, transfer_units, actingUser);
  }

  /**
   * FR-04: track_blood_unit(...) -> BloodUnit
   */
  async trackBloodUnit(bloodBankId, unitData, user) {
    if (user.role !== 'BLOOD_BANK_STAFF' && user.role !== 'ADMIN') {
      throw new AppError('Unauthorized: Only Blood Bank Staff or Admin can register blood units', 403, 'FORBIDDEN');
    }

    const { unit_id, blood_group, component, units, collection_date, expiry_date } = unitData;

    if (!unit_id || !unit_id.trim()) {
      throw new AppError('Blood unit ID is required and cannot be empty', 400, 'INVALID_UNIT_ID');
    }

    if (!BLOOD_GROUPS.includes(blood_group)) {
      throw new AppError(`Invalid blood group: '${blood_group}'. Allowed: ${BLOOD_GROUPS.join(', ')}`, 400, 'INVALID_BLOOD_GROUP');
    }

    if (!COMPONENTS.includes(component)) {
      throw new AppError(`Invalid component: '${component}'. Allowed: ${COMPONENTS.join(', ')}`, 400, 'INVALID_COMPONENT');
    }

    const quantity = parseInt(units, 10);
    if (isNaN(quantity) || quantity <= 0) {
      throw new AppError('Blood unit quantity must be a positive integer (> 0)', 400, 'INVALID_QUANTITY');
    }

    const colDate = new Date(collection_date);
    const expDate = new Date(expiry_date);

    if (isNaN(colDate.getTime()) || isNaN(expDate.getTime())) {
      throw new AppError('Invalid collection_date or expiry_date format', 400, 'INVALID_DATES');
    }

    if (colDate > expDate) {
      throw new AppError('Collection date must precede or equal expiry date', 400, 'INVALID_DATE_RANGE');
    }

    // Check if unit already exists in this blood bank
    const existing = await inventoryRepository.findUnit(bloodBankId, unit_id);
    if (existing) {
      throw new AppError(`Blood unit '${unit_id}' already exists in blood bank '${bloodBankId}'`, 409, 'DUPLICATE_UNIT');
    }

    const created = await inventoryRepository.createUnit({
      bloodBankId,
      unitId: unit_id,
      bloodGroup: blood_group,
      component,
      quantity,
      collectionDate: colDate.toISOString().split('T')[0],
      expiryDate: expDate.toISOString().split('T')[0],
      status: expDate < new Date() ? 'DISCARDED' : 'AVAILABLE'
    });

    // Record audit log
    await db.query(
      `INSERT INTO audit_logs (log_id, user_id, action, entity_name, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        user.userId,
        'BLOOD_UNIT_REGISTERED',
        'BLOOD_UNIT',
        `${bloodBankId}:${unit_id}`,
        JSON.stringify({ blood_group, component, quantity, expiry_date })
      ]
    );

    return created;
  }

  /**
   * FR-05: check_inventory_status(unit_id: str, ...) -> InventoryStatus
   */
  async checkInventoryStatus(bloodBankId, unitId) {
    const unit = await inventoryRepository.findUnit(bloodBankId, unitId);
    if (!unit) {
      throw new AppError(`Blood unit '${unitId}' not found in blood bank '${bloodBankId}'`, 404, 'UNIT_NOT_FOUND');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = new Date(unit.expiry_date);
    expDate.setHours(0, 0, 0, 0);

    const isExpired = expDate < today;
    const isUsable = !isExpired && unit.status === 'AVAILABLE' && unit.quantity > 0;

    return {
      blood_bank_id: unit.blood_bank_id,
      blood_unit_id: unit.blood_unit_id,
      blood_group: unit.blood_group,
      component: unit.component,
      quantity: unit.quantity,
      collection_date: unit.collection_date,
      expiry_date: unit.expiry_date,
      status: unit.status,
      is_expired: isExpired,
      is_usable: isUsable
    };
  }

  /**
   * List inventory with low-stock alerts
   */
  async listInventory(filters, user) {
    const units = await inventoryRepository.listInventory(filters);
    const aggregated = await inventoryRepository.getAggregatedStock(filters.bloodBankId || null);

    // Calculate low-stock warnings
    const lowStockAlerts = [];
    BLOOD_GROUPS.forEach(bg => {
      COMPONENTS.forEach(comp => {
        const found = aggregated.find(a => a.blood_group === bg && a.component === comp);
        const total = found ? parseInt(found.total_units, 10) : 0;
        if (total <= DEFAULT_STOCK_THRESHOLDS.criticalStockThreshold) {
          lowStockAlerts.push({
            blood_group: bg,
            component: comp,
            level: 'CRITICAL',
            available_units: total,
            threshold: DEFAULT_STOCK_THRESHOLDS.criticalStockThreshold
          });
        } else if (total <= DEFAULT_STOCK_THRESHOLDS.lowStockThreshold) {
          lowStockAlerts.push({
            blood_group: bg,
            component: comp,
            level: 'LOW',
            available_units: total,
            threshold: DEFAULT_STOCK_THRESHOLDS.lowStockThreshold
          });
        }
      });
    });

    return {
      units,
      stock_summary: aggregated,
      low_stock_alerts: lowStockAlerts
    };
  }

  /**
   * Transfer blood units between blood banks atomically
   */
  async transferBloodStock(sourceBankId, targetBankId, bloodUnitId, transferUnits, user) {
    if (user.role !== 'BLOOD_BANK_STAFF' && user.role !== 'ADMIN') {
      throw new AppError('Unauthorized: Only Blood Bank Staff or Admin can transfer stock', 403, 'FORBIDDEN');
    }

    const qty = parseInt(transferUnits, 10);
    if (isNaN(qty) || qty <= 0) {
      throw new AppError('Transfer quantity must be positive (> 0)', 400, 'INVALID_QUANTITY');
    }

    if (sourceBankId === targetBankId) {
      throw new AppError('Source and target blood banks must be different', 400, 'INVALID_TRANSFER_DESTINATION');
    }

    return db.withTransaction(async (client) => {
      // Lock source unit
      const res = await client.query(
        `SELECT * FROM blood_unit
         WHERE blood_bank_id = $1 AND blood_unit_id = $2
         FOR UPDATE`,
        [sourceBankId, bloodUnitId]
      );

      if (res.rows.length === 0) {
        throw new AppError('Source blood unit not found', 404, 'UNIT_NOT_FOUND');
      }

      const sourceUnit = res.rows[0];

      if (new Date(sourceUnit.expiry_date) < new Date()) {
        throw new AppError('Cannot transfer expired blood units', 400, 'EXPIRED_UNIT');
      }

      if (sourceUnit.quantity < qty) {
        throw new AppError(`Insufficient stock. Available: ${sourceUnit.quantity}, Requested: ${qty}`, 400, 'INSUFFICIENT_STOCK');
      }

      // Deduct from source
      const remainingSource = sourceUnit.quantity - qty;
      await client.query(
        `UPDATE blood_unit
         SET quantity = $1, status = CASE WHEN $1 = 0 THEN 'TRANSFERRED' ELSE status END
         WHERE blood_bank_id = $2 AND blood_unit_id = $3`,
        [remainingSource, sourceBankId, bloodUnitId]
      );

      // Check target unit or insert
      const targetUnitId = `TRANS-${sourceUnit.blood_unit_id}-${Date.now().toString().slice(-4)}`;
      await client.query(
        `INSERT INTO blood_unit (blood_bank_id, blood_unit_id, blood_group, component, quantity, collection_date, expiry_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'AVAILABLE')`,
        [
          targetBankId,
          targetUnitId,
          sourceUnit.blood_group,
          sourceUnit.component,
          qty,
          sourceUnit.collection_date,
          sourceUnit.expiry_date
        ]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (log_id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          user.userId,
          'BLOOD_STOCK_TRANSFERRED',
          'BLOOD_UNIT',
          bloodUnitId,
          JSON.stringify({ from: sourceBankId, to: targetBankId, quantity: qty })
        ]
      );

      return {
        message: 'Blood stock transfer completed successfully',
        source_remaining: remainingSource,
        target_unit_id: targetUnitId,
        transferred_units: qty
      };
    });
  }
}

const inventoryService = new InventoryService();
inventoryService.manage_inventory = inventoryService.manage_inventory.bind(inventoryService);
inventoryService.transfer_blood_stock = inventoryService.transfer_blood_stock.bind(inventoryService);
module.exports = inventoryService;
module.exports.manage_inventory = inventoryService.manage_inventory;
module.exports.transfer_blood_stock = inventoryService.transfer_blood_stock;
