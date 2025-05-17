const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const {
  createPerformanceReview,
  getAllPerformanceReviews,
  getPerformanceReviewById,
  updatePerformanceReview,
  deletePerformanceReview,
  getVendorPerformance,
  getDepartmentVendorPerformance,
  getPerformanceMetrics,
  generatePerformanceReport,
  getPerformanceHistory,
  getTopPerformingVendors
} = require('../controllers/performanceController');

// Protected routes - all require authentication
router.use(auth);

// Basic performance review operations
router.post('/', 
  roleCheck(['admin', 'procurement_manager', 'department_head']), 
  createPerformanceReview
);

router.get('/', 
  roleCheck(['admin', 'procurement_manager']), 
  getAllPerformanceReviews
);

router.get('/:id', 
  roleCheck(['admin', 'procurement_manager', 'department_head']), 
  getPerformanceReviewById
);

router.put('/:id', 
  roleCheck(['admin', 'procurement_manager', 'department_head']), 
  updatePerformanceReview
);

router.delete('/:id', 
  roleCheck(['admin']), 
  deletePerformanceReview
);

// Vendor-specific performance routes
router.get('/vendor/:vendorId', 
  roleCheck(['admin', 'procurement_manager']), 
  getVendorPerformance
);

router.get('/vendor/:vendorId/history', 
  roleCheck(['admin', 'procurement_manager']), 
  getPerformanceHistory
);

// Department-specific performance routes
router.get('/department/:departmentId', 
  roleCheck(['admin', 'procurement_manager', 'department_head']), 
  getDepartmentVendorPerformance
);

// Performance analysis and reporting
router.get('/metrics', 
  roleCheck(['admin', 'procurement_manager']), 
  getPerformanceMetrics
);

router.get('/report', 
  roleCheck(['admin', 'procurement_manager']), 
  generatePerformanceReport
);

router.get('/top-vendors', 
  roleCheck(['admin', 'procurement_manager']), 
  getTopPerformingVendors
);

module.exports = router;