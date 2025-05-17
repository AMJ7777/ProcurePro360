const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');
const {
  createContract,
  getAllContracts,
  getContractById,
  updateContract,
  deleteContract,
  approveContract,
  rejectContract,
  renewContract,
  terminateContract,
  getContractDocuments,
  uploadContractDocument,
  getExpiringContracts
} = require('../controllers/contractController');

// Protected routes - all require authentication
router.use(auth);

// Basic contract operations
router.post('/', roleCheck(['admin', 'procurement_manager']), createContract);
router.get('/', roleCheck(['admin', 'procurement_manager', 'department_head']), getAllContracts);
router.get('/expiring', roleCheck(['admin', 'procurement_manager']), getExpiringContracts);
router.get('/:id', roleCheck(['admin', 'procurement_manager', 'department_head']), getContractById);
router.put('/:id', roleCheck(['admin', 'procurement_manager']), updateContract);
router.delete('/:id', roleCheck(['admin']), deleteContract);

// Contract workflow management
router.post('/:id/approve', roleCheck(['admin', 'procurement_manager']), approveContract);
router.post('/:id/reject', roleCheck(['admin', 'procurement_manager']), rejectContract);
router.post('/:id/renew', roleCheck(['admin', 'procurement_manager']), renewContract);
router.post('/:id/terminate', roleCheck(['admin']), terminateContract);

// Contract document management
router.get('/:id/documents', roleCheck(['admin', 'procurement_manager']), getContractDocuments);
router.post('/:id/documents', roleCheck(['admin', 'procurement_manager']), uploadContractDocument);

module.exports = router;