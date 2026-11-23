const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const authRepository = require('./auth.repository');
const env = require('../../config/env');
const { AppError } = require('../../middleware/errorHandler');
const { USER_ROLES, BLOOD_GROUPS } = require('../../config/rules');

class AuthService {
  /**
   * FR-01: authenticate_user(email: str, password: str) -> User
   */
  async authenticateUser(email, password, ipAddress = null) {
    if (!email || !password) {
      throw new AppError('Email and password are required', 400, 'MISSING_CREDENTIALS');
    }

    const user = await authRepository.findByEmail(email.trim());
    if (!user) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    // Generate JWT token with disjoint ISA role
    const payload = {
      userId: user.user_id,
      email: user.email,
      role: user.role
    };

    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN
    });

    // Record login audit
    await authRepository.recordLoginAudit(user.user_id, ipAddress);

    // Retrieve user profile
    const fullUser = await authRepository.findById(user.user_id);

    return {
      user: {
        userId: fullUser.user_id,
        email: fullUser.email,
        phone: fullUser.phone,
        role: fullUser.role,
        profile: fullUser.profile,
        createdAt: fullUser.created_at
      },
      token
    };
  }

  /**
   * Register a new user with disjoint ISA specialization
   */
  async registerUser(userData, profileData) {
    const { email, password, phone, role } = userData;

    if (!USER_ROLES.includes(role)) {
      throw new AppError(`Invalid user role: '${role}'. Allowed roles: ${USER_ROLES.join(', ')}`, 400, 'INVALID_ROLE');
    }

    const existing = await authRepository.findByEmail(email);
    if (existing) {
      throw new AppError(`An account with email '${email}' already exists.`, 409, 'DUPLICATE_EMAIL');
    }

    // Role-specific validation
    if (role === 'DONOR') {
      if (!profileData.bloodGroup || !BLOOD_GROUPS.includes(profileData.bloodGroup)) {
        throw new AppError(`Valid blood group required for donor. Allowed: ${BLOOD_GROUPS.join(', ')}`, 400, 'INVALID_BLOOD_GROUP');
      }
      if (!profileData.age || profileData.age < 16 || profileData.age > 100) {
        throw new AppError('Valid age between 16 and 100 is required for donor registration', 400, 'INVALID_AGE');
      }
      if (!profileData.weight || profileData.weight <= 0) {
        throw new AppError('Valid weight greater than 0 is required for donor registration', 400, 'INVALID_WEIGHT');
      }
      if (!profileData.city || !profileData.state) {
        throw new AppError('City and State are required for donor location matching', 400, 'MISSING_LOCATION');
      }
    } else if (role === 'PATIENT') {
      if (!profileData.bloodGroup || !BLOOD_GROUPS.includes(profileData.bloodGroup)) {
        throw new AppError(`Valid blood group required for patient. Allowed: ${BLOOD_GROUPS.join(', ')}`, 400, 'INVALID_BLOOD_GROUP');
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const userId = `USR-${role.substring(0, 4)}-${uuidv4().substring(0, 8).toUpperCase()}`;

    const created = await authRepository.createUserWithSubtype(
      { userId, email: email.toLowerCase().trim(), passwordHash, phone, role },
      profileData
    );

    return created;
  }

  async getProfile(userId) {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new AppError('User profile not found', 404, 'USER_NOT_FOUND');
    }
    return user;
  }
}

module.exports = new AuthService();
