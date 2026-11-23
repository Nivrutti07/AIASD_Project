const {
  BLOOD_GROUPS,
  COMPONENTS,
  RBC_COMPATIBILITY_MATRIX,
  PLASMA_COMPATIBILITY_MATRIX,
  PLATELETS_COMPATIBILITY_MATRIX
} = require('../../config/rules');
const { AppError } = require('../../middleware/errorHandler');

/**
 * Service for deterministic blood compatibility evaluation (FR-07)
 * Implements separate matrices for RBC/Whole Blood, Plasma, and Platelets.
 */
class CompatibilityService {
  /**
   * Checks if donor blood group is compatible with recipient blood group for given component
   * @param {string} donorGroup - e.g. 'O-'
   * @param {string} recipientGroup - e.g. 'A+'
   * @param {string} component - 'WHOLE_BLOOD' | 'RBC' | 'PLASMA' | 'PLATELETS'
   * @returns {boolean}
   */
  checkCompatibility(donorGroup, recipientGroup, component = 'RBC') {
    const dGroup = donorGroup ? donorGroup.trim().toUpperCase() : '';
    const rGroup = recipientGroup ? recipientGroup.trim().toUpperCase() : '';
    const comp = component ? component.trim().toUpperCase() : 'RBC';

    if (!BLOOD_GROUPS.includes(dGroup)) {
      throw new AppError(`Invalid donor blood group: '${donorGroup}'. Must be one of: ${BLOOD_GROUPS.join(', ')}`, 400, 'INVALID_BLOOD_GROUP');
    }

    if (!BLOOD_GROUPS.includes(rGroup)) {
      throw new AppError(`Invalid recipient blood group: '${recipientGroup}'. Must be one of: ${BLOOD_GROUPS.join(', ')}`, 400, 'INVALID_BLOOD_GROUP');
    }

    if (!COMPONENTS.includes(comp)) {
      throw new AppError(`Invalid component: '${component}'. Must be one of: ${COMPONENTS.join(', ')}`, 400, 'INVALID_COMPONENT');
    }

    let compatibleList = [];

    switch (comp) {
      case 'WHOLE_BLOOD':
      case 'RBC':
        compatibleList = RBC_COMPATIBILITY_MATRIX[rGroup] || [];
        break;
      case 'PLASMA':
        compatibleList = PLASMA_COMPATIBILITY_MATRIX[rGroup] || [];
        break;
      case 'PLATELETS':
        compatibleList = PLATELETS_COMPATIBILITY_MATRIX[rGroup] || [];
        break;
      default:
        compatibleList = RBC_COMPATIBILITY_MATRIX[rGroup] || [];
    }

    return compatibleList.includes(dGroup);
  }

  /**
   * Retrieves list of compatible donor groups for a given recipient and component
   */
  getCompatibleDonorGroups(recipientGroup, component = 'RBC') {
    const rGroup = recipientGroup ? recipientGroup.trim().toUpperCase() : '';
    const comp = component ? component.trim().toUpperCase() : 'RBC';

    if (!BLOOD_GROUPS.includes(rGroup)) {
      throw new AppError(`Invalid recipient blood group: '${recipientGroup}'`, 400, 'INVALID_BLOOD_GROUP');
    }

    switch (comp) {
      case 'WHOLE_BLOOD':
      case 'RBC':
        return RBC_COMPATIBILITY_MATRIX[rGroup] || [];
      case 'PLASMA':
        return PLASMA_COMPATIBILITY_MATRIX[rGroup] || [];
      case 'PLATELETS':
        return PLATELETS_COMPATIBILITY_MATRIX[rGroup] || [];
      default:
        return RBC_COMPATIBILITY_MATRIX[rGroup] || [];
    }
  }

  /**
   * Returns full compatibility matrices
   */
  getAllMatrices() {
    return {
      rbc_and_whole_blood: RBC_COMPATIBILITY_MATRIX,
      plasma: PLASMA_COMPATIBILITY_MATRIX,
      platelets: PLATELETS_COMPATIBILITY_MATRIX
    };
  }
}

module.exports = new CompatibilityService();
