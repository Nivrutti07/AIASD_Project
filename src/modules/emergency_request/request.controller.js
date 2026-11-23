const requestService = require('./request.service');

class RequestController {
  async create(req, res, next) {
    try {
      const created = await requestService.createBloodRequest(req.body, req.user);
      return res.status(201).json({
        success: true,
        message: 'Blood request created successfully',
        data: created
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const { request_id } = req.params;
      const request = await requestService.getRequestById(request_id);
      return res.status(200).json({
        success: true,
        data: request
      });
    } catch (err) {
      next(err);
    }
  }

  async list(req, res, next) {
    try {
      const { status, urgency, hospital_id, blood_group } = req.query;
      const requests = await requestService.listRequests({
        status,
        urgency,
        hospitalId: hospital_id,
        bloodGroup: blood_group
      });
      return res.status(200).json({
        success: true,
        data: requests
      });
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req, res, next) {
    try {
      const { request_id } = req.params;
      const { status, fulfilled_quantity } = req.body;
      const updated = await requestService.updateRequestStatus(request_id, status, fulfilled_quantity, req.user);
      return res.status(200).json({
        success: true,
        message: 'Request status updated',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  async rankDonors(req, res, next) {
    try {
      const { request_id } = req.params;
      const { city, state } = req.query;
      const request = await requestService.getRequestById(request_id);
      const ranked = await requestService.rankEligibleDonors(
        request.blood_group,
        request.component,
        { city, state },
        req.user
      );
      return res.status(200).json({
        success: true,
        data: {
          request_id: request.req_id,
          blood_group: request.blood_group,
          component: request.component,
          ranked_eligible_donors: ranked
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async escalate(req, res, next) {
    try {
      const { request_id } = req.params;
      const result = await requestService.escalateRequest(request_id, req.user);
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new RequestController();
