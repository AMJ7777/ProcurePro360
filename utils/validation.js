const { logger } = require('./logger');

class ValidationUtils {
  // Data sanitization
  static sanitizeInput(input) {
    if (typeof input === 'string') {
      // Remove HTML tags
      input = input.replace(/<[^>]*>/g, '');
      // Prevent SQL injection
      input = input.replace(/['";\\]/g, '');
      // Trim whitespace
      input = input.trim();
    }
    return input;
  }

  // Object sanitization
  static sanitizeObject(obj) {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        sanitized[key] = value.map(item => this.sanitizeInput(item));
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = this.sanitizeInput(value);
      }
    }
    return sanitized;
  }

  // Common validation patterns
  static patterns = {
    email: /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/,
    phone: /^\+?[\d\s-]{10,}$/,
    password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  };

  // Validation functions
  static isValidEmail(email) {
    return this.patterns.email.test(email);
  }

  static isValidPhone(phone) {
    return this.patterns.phone.test(phone);
  }

  static isValidPassword(password) {
    return this.patterns.password.test(password);
  }

  static isValidUUID(uuid) {
    return this.patterns.uuid.test(uuid);
  }

  // Date validation
  static isValidDate(date) {
    const d = new Date(date);
    return d instanceof Date && !isNaN(d);
  }

  static isFutureDate(date) {
    const d = new Date(date);
    return this.isValidDate(date) && d > new Date();
  }

  static isDateRange(startDate, endDate) {
    if (!this.isValidDate(startDate) || !this.isValidDate(endDate)) {
      return false;
    }
    return new Date(startDate) < new Date(endDate);
  }

  // Number validation
  static isPositiveNumber(num) {
    return typeof num === 'number' && num > 0;
  }

  static isInRange(num, min, max) {
    return typeof num === 'number' && num >= min && num <= max;
  }

  // Custom validators
  static validateVendor(vendor) {
    const errors = [];

    if (!vendor.company_name) {
      errors.push('Company name is required');
    }

    if (!this.isValidEmail(vendor.email)) {
      errors.push('Invalid email address');
    }

    if (vendor.phone && !this.isValidPhone(vendor.phone)) {
      errors.push('Invalid phone number');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validateContract(contract) {
    const errors = [];

    if (!contract.vendor_id || !this.isValidUUID(contract.vendor_id)) {
      errors.push('Invalid vendor ID');
    }

    if (!contract.start_date || !this.isValidDate(contract.start_date)) {
      errors.push('Invalid start date');
    }

    if (!contract.end_date || !this.isValidDate(contract.end_date)) {
      errors.push('Invalid end date');
    }

    if (!this.isPositiveNumber(contract.value)) {
      errors.push('Invalid contract value');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Error formatting
  static formatValidationErrors(errors) {
    return {
      status: 'error',
      message: 'Validation failed',
      errors: Array.isArray(errors) ? errors : [errors]
    };
  }
}

module.exports = ValidationUtils;