const db = require('../../config/database');
const { DEFAULT_ELIGIBILITY_RULES } = require('../../config/rules');
const { AppError } = require('../../middleware/errorHandler');

class EligibilityService {
  /**
   * Retrieves active eligibility rules from DB system_rules table, or uses defaults
   */
  async getActiveRules() {
    try {
      const res = await db.query(
        "SELECT rule_key, rule_value FROM system_rules WHERE rule_key LIKE 'ELIGIBILITY_%' OR rule_key LIKE 'DONATION_INTERVAL_%'"
      );
      const rules = { ...DEFAULT_ELIGIBILITY_RULES };

      res.rows.forEach(row => {
        if (row.rule_key === 'ELIGIBILITY_MIN_AGE') rules.minAge = parseInt(row.rule_value, 10);
        if (row.rule_key === 'ELIGIBILITY_MAX_AGE') rules.maxAge = parseInt(row.rule_value, 10);
        if (row.rule_key === 'ELIGIBILITY_MIN_WEIGHT') rules.minWeightKg = parseFloat(row.rule_value);
        if (row.rule_key === 'DONATION_INTERVAL_WHOLE_BLOOD') rules.minDonationIntervalDays.WHOLE_BLOOD = parseInt(row.rule_value, 10);
        if (row.rule_key === 'DONATION_INTERVAL_PLASMA') rules.minDonationIntervalDays.PLASMA = parseInt(row.rule_value, 10);
        if (row.rule_key === 'DONATION_INTERVAL_PLATELETS') rules.minDonationIntervalDays.PLATELETS = parseInt(row.rule_value, 10);
      });

      return rules;
    } catch {
      return DEFAULT_ELIGIBILITY_RULES;
    }
  }

  /**
   * FR-03: calculate_eligibility(donor_id: str, ...) -> EligibilityStatus
   * Evaluates donor eligibility against deterministic thresholds
   */
  async calculateEligibility(donorId, component = 'WHOLE_BLOOD') {
    const res = await db.query(
      `SELECT d.donor_id, d.name, d.blood_group, d.age, d.weight, d.city, d.state,
              d.last_donation_date, d.deferral_until, d.medical_history, d.is_available,
              u.phone, u.email
       FROM donor d
       JOIN users u ON d.donor_id = u.user_id
       WHERE d.donor_id = $1`,
      [donorId]
    );

    if (res.rows.length === 0) {
      throw new AppError(`Donor with id '${donorId}' not found`, 404, 'DONOR_NOT_FOUND');
    }

    const donor = res.rows[0];
    const rules = await this.getActiveRules();
    return this.evaluateRules(donor, component, rules);
  }

  /**
   * Pure deterministic rule evaluator (can also be invoked directly with a donor object)
   */
  evaluateRules(donor, component = 'WHOLE_BLOOD', rules = DEFAULT_ELIGIBILITY_RULES) {
    const reasons = [];
    let isEligible = true;
    let nextEligibleDate = null;
    const now = new Date();

    // 1. Age Boundary Check [minAge, maxAge]
    if (donor.age < rules.minAge) {
      isEligible = false;
      reasons.push(`Donor age (${donor.age}) is below minimum requirement of ${rules.minAge} years.`);
    } else if (donor.age > rules.maxAge) {
      isEligible = false;
      reasons.push(`Donor age (${donor.age}) exceeds maximum allowed age of ${rules.maxAge} years.`);
    }

    // 2. Weight Boundary Check [>= minWeightKg]
    if (parseFloat(donor.weight) < rules.minWeightKg) {
      isEligible = false;
      reasons.push(`Donor weight (${donor.weight} kg) is below minimum required weight of ${rules.minWeightKg} kg.`);
    }

    // 3. Temporary Medical Deferral Check
    if (donor.deferral_until) {
      const deferralDate = new Date(donor.deferral_until);
      if (deferralDate > now) {
        isEligible = false;
        reasons.push(`Donor is temporarily deferred until ${deferralDate.toISOString().split('T')[0]}.`);
        if (!nextEligibleDate || deferralDate > nextEligibleDate) {
          nextEligibleDate = deferralDate;
        }
      }
    }

    // 4. Donation Interval Check
    if (donor.last_donation_date) {
      const lastDonation = new Date(donor.last_donation_date);
      const intervalDays = (rules.minDonationIntervalDays && rules.minDonationIntervalDays[component])
        ? rules.minDonationIntervalDays[component]
        : (rules.defaultIntervalDays || 90);

      const eligibleAfter = new Date(lastDonation);
      eligibleAfter.setDate(eligibleAfter.getDate() + intervalDays);

      if (eligibleAfter > now) {
        isEligible = false;
        const diffMs = eligibleAfter.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        reasons.push(`Minimum donation interval of ${intervalDays} days not met for ${component}. ${daysRemaining} day(s) remaining.`);
        if (!nextEligibleDate || eligibleAfter > nextEligibleDate) {
          nextEligibleDate = eligibleAfter;
        }
      }
    }

    // 5. Medical History Disqualification Flags
    if (donor.medical_history) {
      const disqualifiers = ['hepatitis', 'hiv', 'cardiac', 'cancer', 'malaria'];
      const historyLower = donor.medical_history.toLowerCase();
      for (const flag of disqualifiers) {
        if (historyLower.includes(flag)) {
          isEligible = false;
          reasons.push(`Disqualifying medical condition detected: ${flag}.`);
        }
      }
    }

    // 6. Explicit Availability Flag
    if (donor.is_available === false) {
      isEligible = false;
      reasons.push('Donor has set their availability status to inactive.');
    }

    return {
      donor_id: donor.donor_id,
      name: donor.name,
      blood_group: donor.blood_group,
      component,
      is_eligible: isEligible,
      reasons,
      next_eligible_date: nextEligibleDate ? nextEligibleDate.toISOString().split('T')[0] : null,
      evaluated_at: now.toISOString()
    };
  }
}

module.exports = new EligibilityService();
