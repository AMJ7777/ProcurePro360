const { permissions } = require('../config/auth');

const roleCheck = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required'
        });
      }

      const userRole = req.user.role;

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. Insufficient permissions'
        });
      }

      // Optional: Check specific permissions for the role
      const userPermissions = permissions[userRole] || [];
      req.userPermissions = userPermissions;

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Department-specific access check
const departmentCheck = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const departmentId = req.params.departmentId || req.body.departmentId;
      
      if (!departmentId) {
        return next();
      }

      if (req.user.role === 'admin') {
        return next();
      }

      if (req.user.department_id !== departmentId) {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. Not authorized for this department'
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Resource ownership check
const ownershipCheck = (resourceModel) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;
      const resource = await resourceModel.findById(resourceId);

      if (!resource) {
        return res.status(404).json({
          status: 'error',
          message: 'Resource not found'
        });
      }

      if (req.user.role === 'admin') {
        return next();
      }

      if (resource.created_by !== req.user.id) {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. Not the resource owner'
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  roleCheck,
  departmentCheck,
  ownershipCheck
};