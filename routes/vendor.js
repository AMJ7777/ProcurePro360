const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const {
  registerVendor,
  getAllVendors,
  getVendorById,
  updateVendor,
  deleteVendor,
  getVendorPerformance,
  getVendorContracts,
  getVendorPurchaseOrders,
  blacklistVendor,
  activateVendor,
  uploadVendorDocuments
} = require('../controllers/vendorController');

// Protected routes - all require authentication
router.use(auth);

// Routes accessible by procurement managers and admins
router.post('/register', roleCheck(['admin', 'procurement_manager']), registerVendor);
router.get('/', roleCheck(['admin', 'procurement_manager', 'department_head']), getAllVendors);
router.get('/:id', roleCheck(['admin', 'procurement_manager', 'department_head']), getVendorById);
router.put('/:id', roleCheck(['admin', 'procurement_manager']), updateVendor);
router.delete('/:id', roleCheck(['admin']), deleteVendor);

// Vendor performance and contract routes
router.get('/:id/performance', roleCheck(['admin', 'procurement_manager']), getVendorPerformance);
router.get('/:id/contracts', roleCheck(['admin', 'procurement_manager']), getVendorContracts);
router.get('/:id/purchase-orders', roleCheck(['admin', 'procurement_manager']), getVendorPurchaseOrders);

// Vendor status management
router.post('/:id/blacklist', roleCheck(['admin']), blacklistVendor);
router.post('/:id/activate', roleCheck(['admin']), activateVendor);

// Document management
router.post('/:id/documents', roleCheck(['admin', 'procurement_manager']), uploadVendorDocuments);

module.exports = router;