const { v4: uuidv4 } = require('uuid');
const requestRepository = require('./request.repository');
const donorRepository = require('../donor/donor.repository');
const eligibilityService = require('../eligibility/eligibility.service');
const compatibilityService = require('../compatibility/compatibility.service');
const db = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');
const { sanitizeDonorForRequester } = require('../../middleware/auth');
const {
  BLOOD_GROUPS,
  COMPONENTS,
  URGENCY_LEVELS,
  REQUEST_STATUSES,
  DEFAULT_ESCALATION_HOURS
} = require('../../config/rules');

class RequestService {
  /**
   * FR-06: create_blood_request(request_id: str, ...) -> BloodRequest
   */
  async createBloodRequest(requestData, user) {
    const {
      request_id,
      blood_group,
      component,
      quantity,
      urgency = 'NORMAL',
      required_by,
      patient_id,
      hospital_id,
      blood_bank_id
    } = requestData;

    const reqId = request_id || `REQ-${Date.now().toString().slice(-6)}-${uuidv4().substring(0, 4).toUpperCase()}`;

    if (!BLOOD_GROUPS.includes(blood_group)) {
      throw new AppError(`Invalid blood group: '${blood_group}'`, 400, 'INVALID_BLOOD_GROUP');
    }

    const comp = component || 'RBC';
    if (!COMPONENTS.includes(comp)) {
      throw new AppError(`Invalid component: '${comp}'`, 400, 'INVALID_COMPONENT');
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      throw new AppError('Quantity must be a positive integer (> 0)', 400, 'INVALID_QUANTITY');
    }

    if (!URGENCY_LEVELS.includes(urgency)) {
      throw new AppError(`Invalid urgency: '${urgency}'. Allowed: ${URGENCY_LEVELS.join(', ')}`, 400, 'INVALID_URGENCY');
    }

    const reqDate = new Date(required_by);
    if (isNaN(reqDate.getTime())) {
      throw new AppError('Valid required_by timestamp is required', 400, 'INVALID_REQUIRED_BY_DATE');
    }

    const now = new Date();
    if (reqDate < now) {
      throw new AppError('required_by timestamp must be in the future', 400, 'PAST_REQUIRED_BY_DATE');
    }

    // Role-based defaults
    const hospId = user.role === 'HOSPITAL' ? user.userId : (hospital_id || null);
    const patId = user.role === 'PATIENT' ? user.userId : (patient_id || null);

    const created = await requestRepository.create({
      reqId,
      hospitalId: hospId,
      patientId: patId,
      bloodBankId: blood_bank_id || null,
      bloodGroup: blood_group,
      component: comp,
      quantity: qty,
      urgency,
      requiredBy: reqDate.toISOString()
    });

    // Audit log
    await db.query(
      `INSERT INTO audit_logs (log_id, user_id, action, entity_name, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        user.userId,
        'BLOOD_REQUEST_CREATED',
        'BLOOD_REQUEST',
        reqId,
        JSON.stringify({ blood_group, component: comp, quantity: qty, urgency })
      ]
    );

    return created;
  }

  /**
   * FR-08: rank_eligible_donors(request_blood_group, component, donors, ...) -> list[Donor]
   * Excludes ineligible donors.
   * Multi-factor ranking: Exact Match (40 pts), Distance/City (30 pts), Time since last donation (15 pts), Response history (15 pts).
   * Strips donor phone numbers if requested by hospital/patient!
   */
  async rankEligibleDonors(requestBloodGroup, component = 'RBC', targetLocation = {}, requestingUser = null) {
    // 1. Get compatible donor blood groups
    const compatibleGroups = compatibilityService.getCompatibleDonorGroups(requestBloodGroup, component);

    // 2. Fetch all donors matching compatible blood groups and marked available
    const allDonors = await donorRepository.listDonors({ isAvailable: true });

    // 3. Filter for eligibility using deterministic eligibility rules
    const rules = await eligibilityService.getActiveRules();
    const rankedDonors = [];

    for (const donor of allDonors) {
      // Must be in compatible groups
      if (!compatibleGroups.includes(donor.blood_group)) {
        continue;
      }

      // Check eligibility
      const evalResult = eligibilityService.evaluateRules(donor, component, rules);
      if (!evalResult.is_eligible) {
        continue; // Exclude ineligible donors
      }

      // Calculate Ranking Score (0 to 100)
      let score = 0;

      // Factor 1: Blood Group Match (40 points)
      // Exact match gets 40, compatible alternative gets 20
      if (donor.blood_group === requestBloodGroup) {
        score += 40;
      } else {
        score += 20;
      }

      // Factor 2: Distance / Location match (30 points)
      const targetCity = targetLocation.city ? targetLocation.city.trim().toLowerCase() : null;
      const targetState = targetLocation.state ? targetLocation.state.trim().toLowerCase() : null;

      if (targetCity && donor.city && donor.city.toLowerCase() === targetCity) {
        score += 30; // Same city
      } else if (targetState && donor.state && donor.state.toLowerCase() === targetState) {
        score += 15; // Same state
      } else {
        score += 5; // Different location
      }

      // Factor 3: Time since last donation (15 points)
      if (!donor.last_donation_date) {
        score += 15; // Never donated before or long time ago
      } else {
        const lastDonation = new Date(donor.last_donation_date);
        const daysSince = Math.floor((new Date() - lastDonation) / (1000 * 60 * 60 * 24));
        if (daysSince >= 180) {
          score += 15;
        } else if (daysSince >= 120) {
          score += 10;
        } else if (daysSince >= 90) {
          score += 5;
        }
      }

      // Factor 4: Response History (15 points)
      const responseRate = parseFloat(donor.response_rate || 1.0);
      score += Math.round(responseRate * 15);

      // Sanitize phone number if requester is hospital or patient
      const donorRecord = (requestingUser && (requestingUser.role === 'HOSPITAL' || requestingUser.role === 'PATIENT'))
        ? sanitizeDonorForRequester(donor)
        : donor;

      rankedDonors.push({
        ...donorRecord,
        match_score: score,
        is_exact_match: donor.blood_group === requestBloodGroup
      });
    }

    // Sort descending by match score
    rankedDonors.sort((a, b) => b.match_score - a.match_score);

    return rankedDonors;
  }

  /**
   * FR-09: update_request_status(request_id: str, ...) -> RequestStatus
   */
  async updateRequestStatus(reqId, newStatus, fulfilledQty = null, user = null) {
    const existing = await requestRepository.findById(reqId);
    if (!existing) {
      throw new AppError(`Blood request '${reqId}' not found`, 404, 'REQUEST_NOT_FOUND');
    }

    if (!REQUEST_STATUSES.includes(newStatus)) {
      throw new AppError(`Invalid request status: '${newStatus}'. Allowed: ${REQUEST_STATUSES.join(', ')}`, 400, 'INVALID_STATUS');
    }

    const updated = await requestRepository.updateStatus(null, reqId, newStatus, fulfilledQty);

    // Audit log
    if (user) {
      await db.query(
        `INSERT INTO audit_logs (log_id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          user.userId,
          'BLOOD_REQUEST_STATUS_UPDATED',
          'BLOOD_REQUEST',
          reqId,
          JSON.stringify({ from: existing.status, to: newStatus, fulfilled_quantity: fulfilledQty })
        ]
      );
    }

    return updated;
  }

  /**
   * Escalate blood request if urgency threshold is exceeded or manual escalation triggered
   */
  async escalateRequest(reqId, user) {
    const req = await requestRepository.findById(reqId);
    if (!req) {
      throw new AppError(`Blood request '${reqId}' not found`, 404, 'REQUEST_NOT_FOUND');
    }

    if (req.status === 'FULFILLED' || req.status === 'CANCELLED') {
      throw new AppError(`Cannot escalate request with status '${req.status}'`, 400, 'INVALID_ESCALATION_STATE');
    }

    const updated = await this.updateRequestStatus(reqId, 'ESCALATED', null, user);

    // Record escalation audit
    await db.query(
      `INSERT INTO audit_logs (log_id, user_id, action, entity_name, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        user.userId,
        'BLOOD_REQUEST_ESCALATED',
        'BLOOD_REQUEST',
        reqId,
        JSON.stringify({ urgency: req.urgency, blood_group: req.blood_group, quantity: req.quantity })
      ]
    );

    return {
      message: `Emergency request '${reqId}' successfully escalated to regional blood banks and emergency coordinator.`,
      request: updated
    };
  }

  async getRequestById(reqId) {
    const req = await requestRepository.findById(reqId);
    if (!req) {
      throw new AppError(`Blood request '${reqId}' not found`, 404, 'REQUEST_NOT_FOUND');
    }
    return req;
  }

  async listRequests(filters) {
    return requestRepository.listRequests(filters);
  }
}

module.exports = new RequestService();
