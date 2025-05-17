const { Contract } = require('../models/Contract');
const { ValidationUtils } = require('../utils/validation');
const DatabaseUtils = require('../utils/database');
const emailService = require('../utils/email');
const { logger } = require('../utils/logger');

class ContractController {
    // Create new contract
    async createContract(req, res) {
        try {
            const {
                vendor_id,
                title,
                description,
                start_date,
                end_date,
                value,
                terms_conditions,
                renewal_terms
            } = req.body;

            // Validate data
            if (!ValidationUtils.isDateRange(start_date, end_date)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid date range'
                });
            }

            // Create contract using transaction
            const result = await DatabaseUtils.withTransaction(async (connection) => {
                // Generate contract number
                const contractNumber = await this.generateContractNumber(connection);

                // Insert contract
                const [contractResult] = await connection.query(
                    `INSERT INTO contracts (
                        vendor_id, contract_number, title, description,
                        start_date, end_date, value, status,
                        terms_conditions, renewal_terms, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [vendor_id, contractNumber, title, description, 
                     start_date, end_date, value, 'draft',
                     terms_conditions, renewal_terms, req.user.id]
                );

                // Log contract creation
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id, 
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['CONTRACT_CREATION', 'contract', contractResult.insertId,
                     `Contract ${contractNumber} created`, req.user.id]
                );

                return { id: contractResult.insertId, contractNumber };
            });

            // Send notification email
            await emailService.sendContractCreationNotification({
                vendorId: vendor_id,
                contractNumber: result.contractNumber,
                title
            });

            res.status(201).json({
                status: 'success',
                message: 'Contract created successfully',
                data: result
            });

        } catch (error) {
            logger.error('Error creating contract:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error creating contract',
                error: error.message
            });
        }
    }

    // Get all contracts with filtering and pagination
    async getAllContracts(req, res) {
        try {
            const {
                page = 1,
                limit = 10,
                status,
                vendor_id,
                start_date,
                end_date,
                search
            } = req.query;

            let query = `
                SELECT c.*, v.company_name as vendor_name,
                       u.username as created_by_name
                FROM contracts c
                LEFT JOIN vendors v ON c.vendor_id = v.id
                LEFT JOIN users u ON c.created_by = u.id
                WHERE 1=1
            `;
            
            const params = [];

            // Apply filters
            if (status) {
                query += ' AND c.status = ?';
                params.push(status);
            }

            if (vendor_id) {
                query += ' AND c.vendor_id = ?';
                params.push(vendor_id);
            }

            if (start_date) {
                query += ' AND c.start_date >= ?';
                params.push(start_date);
            }

            if (end_date) {
                query += ' AND c.end_date <= ?';
                params.push(end_date);
            }

            if (search) {
                query += ` AND (c.title LIKE ? OR c.contract_number LIKE ? 
                           OR v.company_name LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`, `%${search}%`);
            }

            const result = await DatabaseUtils.paginate(query, params, page, limit);
            res.json(result);

        } catch (error) {
            logger.error('Error fetching contracts:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching contracts',
                error: error.message
            });
        }
    }

    // Get contract by ID with full details
    async getContractById(req, res) {
        try {
            const { id } = req.params;

            const [contract] = await DatabaseUtils.executeQuery(
                `SELECT c.*, v.company_name as vendor_name,
                        u.username as created_by_name,
                        (SELECT JSON_ARRAYAGG(
                            JSON_OBJECT(
                                'id', d.id,
                                'filename', d.filename,
                                'uploaded_at', d.created_at
                            )
                        ) FROM contract_documents d WHERE d.contract_id = c.id
                        ) as documents
                 FROM contracts c
                 LEFT JOIN vendors v ON c.vendor_id = v.id
                 LEFT JOIN users u ON c.created_by = u.id
                 WHERE c.id = ?`,
                [id]
            );

            if (!contract) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Contract not found'
                });
            }

            res.json({
                status: 'success',
                data: contract
            });

        } catch (error) {
            logger.error('Error fetching contract:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching contract',
                error: error.message
            });
        }
    }

    // Update contract
    async updateContract(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            // Validate update data
            if (updateData.start_date && updateData.end_date) {
                if (!ValidationUtils.isDateRange(updateData.start_date, updateData.end_date)) {
                    return res.status(400).json({
                        status: 'error',
                        message: 'Invalid date range'
                    });
                }
            }

            await DatabaseUtils.withTransaction(async (connection) => {
                // Update contract
                await connection.query(
                    'UPDATE contracts SET ? WHERE id = ?',
                    [updateData, id]
                );

                // Log update
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id,
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['CONTRACT_UPDATE', 'contract', id,
                     'Contract updated', req.user.id]
                );
            });

            res.json({
                status: 'success',
                message: 'Contract updated successfully'
            });

        } catch (error) {
            logger.error('Error updating contract:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error updating contract',
                error: error.message
            });
        }
    }

    // Approve contract
    async approveContract(req, res) {
        try {
            const { id } = req.params;
            const { comments } = req.body;

            await DatabaseUtils.withTransaction(async (connection) => {
                // Update contract status
                await connection.query(
                    `UPDATE contracts 
                     SET status = 'active',
                         approved_by = ?,
                         approved_at = CURRENT_TIMESTAMP,
                         approval_comments = ?
                     WHERE id = ?`,
                    [req.user.id, comments, id]
                );

                // Log approval
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id,
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['CONTRACT_APPROVAL', 'contract', id,
                     'Contract approved', req.user.id]
                );
            });

            // Send approval notification
            await emailService.sendContractApprovalNotification(id);

            res.json({
                status: 'success',
                message: 'Contract approved successfully'
            });

        } catch (error) {
            logger.error('Error approving contract:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error approving contract',
                error: error.message
            });
        }
    }

    // Terminate contract
    async terminateContract(req, res) {
        try {
            const { id } = req.params;
            const { termination_reason } = req.body;

            await DatabaseUtils.withTransaction(async (connection) => {
                // Update contract status
                await connection.query(
                    `UPDATE contracts 
                     SET status = 'terminated',
                         termination_date = CURRENT_TIMESTAMP,
                         termination_reason = ?,
                         terminated_by = ?
                     WHERE id = ?`,
                    [termination_reason, req.user.id, id]
                );

                // Log termination
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id,
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['CONTRACT_TERMINATION', 'contract', id,
                     'Contract terminated', req.user.id]
                );
            });

            // Send termination notification
            await emailService.sendContractTerminationNotification(id);

            res.json({
                status: 'success',
                message: 'Contract terminated successfully'
            });

        } catch (error) {
            logger.error('Error terminating contract:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error terminating contract',
                error: error.message
            });
        }
    }

    // Helper method to generate contract number
    async generateContractNumber(connection) {
        const [result] = await connection.query(
            `SELECT COUNT(*) as count FROM contracts 
             WHERE YEAR(created_at) = YEAR(CURRENT_TIMESTAMP)`
        );
        
        const count = result[0].count + 1;
        return `CNT-${new Date().getFullYear()}-${count.toString().padStart(5, '0')}`;
    }

    // Other methods...

    // Get expiring contracts
    async getExpiringContracts(req, res) {
        try {
            const { days = 30 } = req.query;

            const result = await DatabaseUtils.executeQuery(
                `SELECT c.*, v.company_name as vendor_name
                 FROM contracts c
                 LEFT JOIN vendors v ON c.vendor_id = v.id
                 WHERE c.status = 'active'
                 AND DATEDIFF(c.end_date, CURRENT_DATE) <= ?`,
                [days]
            );

            res.json({
                status: 'success',
                data: result
            });

        } catch (error) {
            logger.error('Error fetching expiring contracts:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching expiring contracts',
                error: error.message
            });
        }
    }

    // Upload contract document
    async uploadContractDocument(req, res) {
        try {
            const { id } = req.params;
            const { filename } = req.body;

            await DatabaseUtils.withTransaction(async (connection) => {
                // Insert document
                await connection.query(
                    `INSERT INTO contract_documents (
                        contract_id, filename, created_by
                    ) VALUES (?, ?, ?)`,
                    [id, filename, req.user.id]
                );

                // Log document upload
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id,
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['CONTRACT_DOCUMENT_UPLOAD', 'contract', id,
                     'Contract document uploaded', req.user.id]
                );
            });

            res.json({
                status: 'success',
                message: 'Document uploaded successfully'
            });

        } catch (error) {
            logger.error('Error uploading document:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error uploading document',
                error: error.message
            });
        }
    }

    // Other methods...

    // Reject contract
    async rejectContract(req, res) {
        try {
            const { id } = req.params;
            const { comments } = req.body;

            await DatabaseUtils.withTransaction(async (connection) => {
                // Update contract status
                await connection.query(
                    `UPDATE contracts 
                     SET status = 'rejected',
                         rejected_by = ?,
                         rejected_at = CURRENT_TIMESTAMP,
                         rejection_comments = ?
                     WHERE id = ?`,
                    [req.user.id, comments, id]
                );

                // Log rejection
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id,
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['CONTRACT_REJECTION', 'contract', id,
                     'Contract rejected', req.user.id]
                );
            });

            // Send rejection notification
            await emailService.sendContractRejectionNotification(id);

            res.json({
                status: 'success',
                message: 'Contract rejected successfully'
            });

        } catch (error) {
            logger.error('Error rejecting contract:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error rejecting contract',
                error: error.message
            });
        }
    }

    // Renew contract
    async renewContract(req, res) {
        try {
            const { id } = req.params;
            const { renewal_terms } = req.body;

            await DatabaseUtils.withTransaction(async (connection) => {
                // Update contract status
                await connection.query(
                    `UPDATE contracts 
                     SET status = 'renewed',
                         renewal_terms = ?,
                         renewed_by = ?,
                         renewed_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [renewal_terms, req.user.id, id]
                );

                // Log renewal
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id,
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['CONTRACT_RENEWAL', 'contract', id,
                     'Contract renewed', req.user.id]
                );
            });

            // Send renewal notification
            await emailService.sendContractRenewalNotification(id);

            res.json({
                status: 'success',
                message: 'Contract renewed successfully'
            });

        } catch (error) {
            logger.error('Error renewing contract:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error renewing contract',
                error: error.message
            });
        }
    }

    // Get contract documents
    async getContractDocuments(req, res) {
        try {
            const { id } = req.params;

            const [documents] = await DatabaseUtils.executeQuery(
                `SELECT id, filename, created_at
                 FROM contract_documents
                 WHERE contract_id = ?`,
                [id]
            );

            res.json({
                status: 'success',
                data: documents
            });

        } catch (error) {
            logger.error('Error fetching contract documents:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching contract documents',
                error: error.message
            });
        }
    }

    // Other methods...

    // Delete contract
    async deleteContract(req, res) {
        try {
            const { id } = req.params;

            await DatabaseUtils.withTransaction(async (connection) => {
                // Delete contract
                await connection.query(
                    'DELETE FROM contracts WHERE id = ?',
                    [id]
                );

                // Log deletion
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id,
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['CONTRACT_DELETION', 'contract', id,
                     'Contract deleted', req.user.id]
                );
            });

            res.json({
                status: 'success',
                message: 'Contract deleted successfully'
            });

        } catch (error) {
            logger.error('Error deleting contract:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error deleting contract',
                error: error.message
            });
        }
    }


}

module.exports = new ContractController();