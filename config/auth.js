const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const jwtConfig = {
  secret: process.env.JWT_SECRET,
  options: {
    expiresIn: '24h', // Token expires in 24 hours
    issuer: 'vendor-management-system'
  }
};

const generateToken = (userId, role) => {
  return jwt.sign(
    { 
      userId, 
      role 
    },
    jwtConfig.secret,
    jwtConfig.options
  );
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, jwtConfig.secret);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

// Define roles and their permissions
const roles = {
    ADMIN: 'admin',
    PROCUREMENT_MANAGER: 'procurement_manager',
    DEPARTMENT_HEAD: 'department_head',
    VENDOR: 'vendor'
  };
  
  const permissions = {
    admin: ['manage_users', 'manage_vendors', 'manage_contracts', 'manage_budgets', 'view_reports'],
    procurement_manager: ['manage_vendors', 'manage_contracts', 'view_reports'],
    department_head: ['create_purchase_orders', 'view_department_budgets', 'evaluate_vendors'],
    vendor: ['view_own_contracts', 'view_own_purchase_orders', 'update_profile']
  };
  
  module.exports = {
    generateToken,
    verifyToken,
    roles,
    permissions,
    jwtConfig
  };