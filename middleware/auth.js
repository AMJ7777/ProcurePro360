const jwt = require('jsonwebtoken');
const { verifyToken } = require('../config/auth');
const { User } = require('../models/User');

const auth = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'No authentication token, access denied'
      });
    }

    // Verify token
    const decoded = verifyToken(token);

    // Get user from database
    const user = await User.findByEmail(decoded.email);

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'User not found'
      });
    }

    if (!user.is_active) {
      return res.status(401).json({
        status: 'error',
        message: 'User account is deactivated'
      });
    }

    // Add user info to request
    req.user = user;
    req.token = token;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid authentication token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token has expired'
      });
    }

    next(error);
  }
};

// Optional: Refresh Token Middleware
const refreshToken = async (req, res, next) => {
  try {
    const token = req.header('Refresh-Token');
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'No refresh token provided'
      });
    }

    // Verify refresh token and issue new access token
    // Implementation depends on your refresh token strategy
    
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  auth,
  refreshToken
};