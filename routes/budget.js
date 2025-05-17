const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const {
  createBudget,
  getAllBudgets,
  getBudgetById,
  updateBudget,
  deleteBudget,
  getDepartmentBudget,
  allocateBudget,
  transferBudget,
  getBudgetUtilization,
  getBudgetHistory,
  getFiscalYearReport
} = require('../controllers/budgetController');

// Protected routes - all require authentication
router.use(auth);

// Basic budget operations
router.post('/', roleCheck(['admin']), createBudget);
router.get('/', roleCheck(['admin', 'procurement_manager']), getAllBudgets);
router.get('/:id', roleCheck(['admin', 'procurement_manager', 'department_head']), getBudgetById);
router.put('/:id', roleCheck(['admin']), updateBudget);
router.delete('/:id', roleCheck(['admin']), deleteBudget);

// Department-specific budget operations
router.get('/department/:departmentId', 
  roleCheck(['admin', 'procurement_manager', 'department_head']), 
  getDepartmentBudget
);

// Budget allocation and transfer
router.post('/allocate', roleCheck(['admin']), allocateBudget);
router.post('/transfer', roleCheck(['admin']), transferBudget);

// Budget analysis and reporting
router.get('/utilization/:departmentId', 
  roleCheck(['admin', 'procurement_manager', 'department_head']), 
  getBudgetUtilization
);

router.get('/history/:departmentId', 
  roleCheck(['admin', 'procurement_manager', 'department_head']), 
  getBudgetHistory
);

router.get('/fiscal-year/:year', 
  roleCheck(['admin', 'procurement_manager']), 
  getFiscalYearReport
);

module.exports = router;