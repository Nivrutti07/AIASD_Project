const authService = require('./auth.service');

class AuthController {
  async register(req, res, next) {
    try {
      const { email, password, phone, role, profile } = req.body;
      const result = await authService.registerUser(
        { email, password, phone, role },
        profile || {}
      );
      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const result = await authService.authenticateUser(email, password, ipAddress);
      return res.status(200).json({
        success: true,
        message: 'Authentication successful',
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  async getMe(req, res, next) {
    try {
      const userId = req.user.userId;
      const user = await authService.getProfile(userId);
      return res.status(200).json({
        success: true,
        data: user
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AuthController();
