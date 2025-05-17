const { check, validationResult } = require('express-validator');

// Common validation rules
const validationRules = {
  // User validation rules
  user: {
    create: [
      check('email').isEmail().normalizeEmail(),
      check('password').isLength({ min: 8 }),
      check('username').isLength({ min: 3 }),
      check('role').isIn(['admin', 'procurement_manager', 'department_head', 'staff'])
    ],
    update: [
      check('email').optional().isEmail().normalizeEmail(),
      check('username').optional().isLength({ min: 3 })
    ]
  },

  // Vendor validation rules
  vendor: {
    create: [
      check('company_name').notEmpty(),
      check('contact_person').notEmpty(),
      check('email').isEmail().normalizeEmail(),
      check('phone').optional().matches(/^\+?[\d\s-]+$/),
      check('registration_number').notEmpty(),
      check('tax_id').notEmpty()
    ],
    update: [
      check('company_name').optional().notEmpty(),
      check('email').optional().isEmail().normalizeEmail(),
      check('phone').optional().matches(/^\+?[\d\s-]+$/)
    ]
  },

  // Contract validation rules
  contract: {
    create: [
      check('vendor_id').isUUID(),
      check('title').notEmpty(),
      check('start_date').isISO8601(),
      check('end_date').isISO8601(),
      check('value').isNumeric()
    ],
    update: [
      check('title').optional().notEmpty(),
      check('start_date').optional().isISO8601(),
      check('end_date').optional().isISO8601(),
      check('value').optional().isNumeric()
    ]
  },

  // Purchase Order validation rules
  purchaseOrder: {
    create: [
      check('vendor_id').isUUID(),
      check('department_id').isUUID(),
      check('items').isArray(),
      check('total_amount').isNumeric(),
      check('delivery_date').optional().isISO8601()
    ]
  }
};

// Validation middleware
const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: errors.array()
    });
  };
};

// Custom validators
const customValidators = {
  // Check if date is in future
  isFutureDate: (value) => {
    const date = new Date(value);
    return date > new Date();
  },

  // Check if end date is after start date
  isAfterStartDate: (value, { req }) => {
    const startDate = new Date(req.body.start_date);
    const endDate = new Date(value);
    return endDate > startDate;
  },

  // Check if budget is available
  isBudgetAvailable: async (value, { req }) => {
    // Implementation depends on your budget tracking logic
    return true;
  }
};

module.exports = {
  validationRules,
  validate,
  customValidators
};