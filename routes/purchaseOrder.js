const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const {
  createPurchaseOrder,
  getAllPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
  approvePurchaseOrder,
  rejectPurchaseOrder,
  completePurchaseOrder,
  getDepartmentPurchaseOrders,
  getPurchaseOrderDocuments,
  uploadPurchaseOrderDocument
} = require('../controllers/poController');

// Protected routes - all require authentication
router.use(auth);

// Basic PO operations
router.post('/', 
  roleCheck(['admin', 'procurement_manager', 'department_head']), 

  createPurchaseOrder
);

router.get('/', roleCheck(['admin', 'procurement_manager', 'department_head']), getAllPurchaseOrders);
router.get('/department/:departmentId', roleCheck(['admin', 'procurement_manager', 'department_head']), getDepartmentPurchaseOrders);
router.get('/:id', roleCheck(['admin', 'procurement_manager', 'department_head']), getPurchaseOrderById);

router.put('/:id', 
  roleCheck(['admin', 'procurement_manager', 'department_head']), 

  updatePurchaseOrder
);

router.delete('/:id', roleCheck(['admin']), deletePurchaseOrder);

// PO workflow management
router.post('/:id/approve', roleCheck(['admin', 'procurement_manager']), approvePurchaseOrder);
router.post('/:id/reject', roleCheck(['admin', 'procurement_manager']), rejectPurchaseOrder);
router.post('/:id/complete', roleCheck(['admin', 'procurement_manager']), completePurchaseOrder);

// PO document management
router.get('/:id/documents', roleCheck(['admin', 'procurement_manager', 'department_head']), getPurchaseOrderDocuments);
router.post('/:id/documents', roleCheck(['admin', 'procurement_manager', 'department_head']), uploadPurchaseOrderDocument);

module.exports = router;