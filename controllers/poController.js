const { PurchaseOrder } = require('../models/PurchaseOrder');
const { ValidationUtils } = require('../utils/validation');
const DatabaseUtils = require('../utils/database');
const emailService = require('../utils/email');
const { logger } = require('../utils/logger');

class PurchaseOrderController {
    // Create new purchase order
    async createPurchaseOrder(req, res) {
        try {
            const {
                vendor_id,
                contract_id,
                department_id,
                items,
                total_amount,
                delivery_date,
                delivery_address,
                special_instructions
            } = req.body;

            // Validate basic data
            if (!vendor_id || !department_id || !items || !total_amount) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Missing required fields'
                });
            }

            // Check budget availability using stored procedure
            const budgetCheck = await DatabaseUtils.executeQuery(
                'CALL CheckDepartmentBudget(?, ?)',
                [department_id, total_amount]
            );

            if (!budgetCheck.isAvailable) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Insufficient budget for this purchase order'
                });
            }

            // Create PO using transaction
            const result = await DatabaseUtils.withTransaction(async (connection) => {
                // Generate PO number
                const poNumber = await this.generatePONumber(connection);

                // Insert PO
                const [poResult] = await connection.query(
                    `INSERT INTO purchase_orders (
                        po_number, vendor_id, contract_id, department_id,
                        items, total_amount, status, delivery_date,
                        delivery_address, special_instructions, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [poNumber, vendor_id, contract_id, department_id,
                     JSON.stringify(items), total_amount, 'draft', delivery_date,
                     delivery_address, special_instructions, req.user.id]
                );

                // Update budget allocation
                await connection.query(
                    `UPDATE budgets 
                     SET allocated_amount = allocated_amount + ?,
                         remaining_amount = remaining_amount - ?
                     WHERE department_id = ? 
                     AND fiscal_year = YEAR(CURRENT_DATE)`,
                    [total_amount, total_amount, department_id]
                );

                // Log PO creation
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id,
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['PO_CREATION', 'purchase_order', poResult.insertId,
                     `Purchase Order ${poNumber} created`, req.user.id]
                );

                return { id: poResult.insertId, poNumber };
            });

            // Send notification email
            await emailService.sendPOCreationNotification({
                vendorId: vendor_id,
                poNumber: result.poNumber,
                amount: total_amount
            });

            res.status(201).json({
                status: 'success',
                message: 'Purchase Order created successfully',
                data: result
            });

        } catch (error) {
            logger.error('Error creating purchase order:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error creating purchase order',
                error: error.message
            });
        }
    }

    // Get all purchase orders with filtering and pagination
    async getAllPurchaseOrders(req, res) {
        try {
            const {
                page = 1,
                limit = 10,
                status,
                vendor_id,
                department_id,
                start_date,
                end_date,
                search
            } = req.query;

            let query = `
                SELECT po.*, v.company_name as vendor_name,
                       d.name as department_name,
                       u.username as created_by_name
                FROM purchase_orders po
                LEFT JOIN vendors v ON po.vendor_id = v.id
                LEFT JOIN departments d ON po.department_id = d.id
                LEFT JOIN users u ON po.created_by = u.id
                WHERE 1=1
            `;
            
            const params = [];

            // Apply filters
            if (status) {
                query += ' AND po.status = ?';
                params.push(status);
            }

            if (vendor_id) {
                query += ' AND po.vendor_id = ?';
                params.push(vendor_id);
            }

            if (department_id) {
                query += ' AND po.department_id = ?';
                params.push(department_id);
            }

            if (start_date) {
                query += ' AND po.created_at >= ?';
                params.push(start_date);
            }

            if (end_date) {
                query += ' AND po.created_at <= ?';
                params.push(end_date);
            }

            if (search) {
                query += ` AND (po.po_number LIKE ? OR v.company_name LIKE ? 
                           OR d.name LIKE ?)`;
                params.push(`%${search}%`, `%${search}%`, `%${search}%`);
            }

            const result = await DatabaseUtils.paginate(query, params, page, limit);
            res.json(result);

        } catch (error) {
            logger.error('Error fetching purchase orders:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching purchase orders',
                error: error.message
            });
        }
    }

    // Get PO by ID with full details
    async getPurchaseOrderById(req, res) {
        try {
            const { id } = req.params;

            const [po] = await DatabaseUtils.executeQuery(
                `SELECT po.*, v.company_name as vendor_name,
                        d.name as department_name,
                        u.username as created_by_name,
                        ua.username as approved_by_name
                 FROM purchase_orders po
                 LEFT JOIN vendors v ON po.vendor_id = v.id
                 LEFT JOIN departments d ON po.department_id = d.id
                 LEFT JOIN users u ON po.created_by = u.id
                 LEFT JOIN users ua ON po.approved_by = ua.id
                 WHERE po.id = ?`,
                [id]
            );

            if (!po) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Purchase Order not found'
                });
            }

            // Parse items JSON
            po.items = JSON.parse(po.items);

            res.json({
                status: 'success',
                data: po
            });

        } catch (error) {
            logger.error('Error fetching purchase order:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching purchase order',
                error: error.message
            });
        }
    }

    // Approve purchase order
    async approvePurchaseOrder(req, res) {
        try {
            const { id } = req.params;
            const { comments } = req.body;

            await DatabaseUtils.withTransaction(async (connection) => {
                // Update PO status
                await connection.query(
                    `UPDATE purchase_orders 
                     SET status = 'approved',
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
                    ['PO_APPROVAL', 'purchase_order', id,
                     'Purchase Order approved', req.user.id]
                );
            });

            // Send approval notification
            await emailService.sendPOApprovalNotification(id);

            res.json({
                status: 'success',
                message: 'Purchase Order approved successfully'
            });

        } catch (error) {
            logger.error('Error approving purchase order:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error approving purchase order',
                error: error.message
            });
        }
    }

    // Helper method to generate PO number
    async generatePONumber(connection) {
        const [result] = await connection.query(
            `SELECT COUNT(*) as count FROM purchase_orders 
             WHERE YEAR(created_at) = YEAR(CURRENT_TIMESTAMP)`
        );
        
        const count = result[0].count + 1;
        return `PO-${new Date().getFullYear()}-${count.toString().padStart(5, '0')}`;
    }

    // Update purchase order
    async updatePurchaseOrder(req, res) {
        try {
            const { id } = req.params;
            const {
                vendor_id,
                contract_id,
                department_id,
                items,
                total_amount,
                delivery_date,
                delivery_address,
                special_instructions
            } = req.body;

            // Validate basic data
            if (!vendor_id || !department_id || !items || !total_amount) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Missing required fields'
                });
            }

            // Check budget availability using stored procedure
            const budgetCheck = await DatabaseUtils.executeQuery(
                'CALL CheckDepartmentBudget(?, ?)',
                [department_id, total_amount]
            );

            if (!budgetCheck.isAvailable) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Insufficient budget for this purchase order'
                });
            }

            // Update PO using transaction
            await DatabaseUtils.withTransaction(async (connection) => {
                // Update PO
                await connection.query(
                    `UPDATE purchase_orders 
                     SET vendor_id = ?, contract_id = ?, department_id = ?,
                         items = ?, total_amount = ?, delivery_date = ?,
                         delivery_address = ?, special_instructions = ?
                     WHERE id = ?`,
                    [vendor_id, contract_id, department_id, JSON.stringify(items),
                     total_amount, delivery_date, delivery_address, special_instructions, id]
                );

                // Log PO update
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id,
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['PO_UPDATE', 'purchase_order', id,
                     `Purchase Order updated`, req.user.id]
                );
            });

            res.json({
                status: 'success',
                message: 'Purchase Order updated successfully'
            });

        } catch (error) {
            logger.error('Error updating purchase order:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error updating purchase order',
                error: error.message
            });
        }
    }

    // Delete purchase order
    async deletePurchaseOrder(req, res) {
        try {
            const { id } = req.params;

            // Check if PO exists
            const [po] = await DatabaseUtils.executeQuery(
                'SELECT * FROM purchase_orders WHERE id = ?',
                [id]
            );

            if (!po) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Purchase Order not found'
                });
            }

            // Delete PO using transaction
            await DatabaseUtils.withTransaction(async (connection) => {
                // Delete PO
                await connection.query(
                    'DELETE FROM purchase_orders WHERE id = ?',
                    [id]
                );

                // Update budget allocation
                await connection.query(
                    `UPDATE budgets 
                     SET allocated_amount = allocated_amount - ?,
                         remaining_amount = remaining_amount + ?
                     WHERE department_id = ? 
                     AND fiscal_year = YEAR(CURRENT_DATE)`,
                    [po.total_amount, po.total_amount, po.department_id]
                );

                // Log PO deletion
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id,
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['PO_DELETION', 'purchase_order', id,
                     'Purchase Order deleted', req.user.id]
                );
            });

            res.json({
                status: 'success',
                message: 'Purchase Order deleted successfully'
            });

        } catch (error) {
            logger.error('Error deleting purchase order:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error deleting purchase order',
                error: error.message
            });
        }
    }

    // Reject purchase order
    async rejectPurchaseOrder(req, res) {
        try {
            const { id } = req.params;
            const { comments } = req.body;

            await DatabaseUtils.withTransaction(async (connection) => {
                // Update PO status
                await connection.query(
                    `UPDATE purchase_orders 
                     SET status = 'rejected',
                         approved_by = ?,
                         approved_at = CURRENT_TIMESTAMP,
                         approval_comments = ?
                     WHERE id = ?`,
                    [req.user.id, comments, id]
                );

                // Log rejection
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id,
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['PO_REJECTION', 'purchase_order', id,
                     'Purchase Order rejected', req.user.id]
                );
            });

            // Send rejection notification
            await emailService.sendPORejectionNotification(id);

            res.json({
                status: 'success',
                message: 'Purchase Order rejected successfully'
            });

        } catch (error) {
            logger.error('Error rejecting purchase order:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error rejecting purchase order',
                error: error.message
            });
        }
    }

    // Complete purchase order
    async completePurchaseOrder(req, res) {
        try {
            const { id } = req.params;

            await DatabaseUtils.withTransaction(async (connection) => {
                // Update PO status
                await connection.query(
                    `UPDATE purchase_orders 
                     SET status = 'completed'
                     WHERE id = ?`,
                    [id]
                );

                // Log completion
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id,
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['PO_COMPLETION', 'purchase_order', id,
                     'Purchase Order completed', req.user.id]
                );
            });

            // Send completion notification
            await emailService.sendPOCompletionNotification(id);

            res.json({
                status: 'success',
                message: 'Purchase Order completed successfully'
            });

        } catch (error) {
            logger.error('Error completing purchase order:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error completing purchase order',
                error: error.message
            });
        }
    }

    // Get all purchase orders for a department
    async getDepartmentPurchaseOrders(req, res) {
        try {
            const { departmentId } = req.params;

            const [department] = await DatabaseUtils.executeQuery(
                'SELECT * FROM departments WHERE id = ?',
                [departmentId]
            );

            if (!department) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Department not found'
                });
            }

            const purchaseOrders = await DatabaseUtils.executeQuery(
                'SELECT * FROM purchase_orders WHERE department_id = ?',
                [departmentId]
            );

            res.json({
                status: 'success',
                data: purchaseOrders
            });

        } catch (error) {
            logger.error('Error fetching department purchase orders:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching department purchase orders',
                error: error.message
            });
        }
    }

    // Get PO documents
    async getPurchaseOrderDocuments(req, res) {
        try {
            const { id } = req.params;

            const [po] = await DatabaseUtils.executeQuery(
                'SELECT * FROM purchase_orders WHERE id = ?',
                [id]
            );

            if (!po) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Purchase Order not found'
                });
            }

            const documents = await DatabaseUtils.executeQuery(
                'SELECT * FROM po_documents WHERE po_id = ?',
                [id]
            );

            res.json({
                status: 'success',
                data: documents
            });

        } catch (error) {
            logger.error('Error fetching PO documents:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching PO documents',
                error: error.message
            });
        }
    }

    // Upload PO document
    async uploadPurchaseOrderDocument(req, res) {
        try {
            const { id } = req.params;
            const { filename } = req.file;

            // Check if PO exists
            const [po] = await DatabaseUtils.executeQuery(
                'SELECT * FROM purchase_orders WHERE id = ?',
                [id]
            );

            if (!po) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Purchase Order not found'
                });
            }

            // Insert document
            await DatabaseUtils.executeQuery(
                'INSERT INTO po_documents (po_id, filename) VALUES (?, ?)',
                [id, filename]
            );

            res.json({
                status: 'success',
                message: 'Document uploaded successfully'
            });

        } catch (error) {
            logger.error('Error uploading PO document:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error uploading PO document',
                error: error.message
            });
        }
    }

    // Get PO items
    async getPurchaseOrderItems(req, res) {
        try {
            const { id } = req.params;

            const [po] = await DatabaseUtils.executeQuery(
                'SELECT items FROM purchase_orders WHERE id = ?',
                [id]
            );

            if (!po) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Purchase Order not found'
                });
            }

            res.json({
                status: 'success',
                data: JSON.parse(po.items)
            });

        } catch (error) {
            logger.error('Error fetching PO items:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching PO items',
                error: error.message
            });
        }
    }

    // Update PO items
    async updatePurchaseOrderItems(req, res) {
        try {
            const { id } = req.params;
            const { items } = req.body;

            // Validate items
            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid items data'
                });
            }

            // Check if PO exists
            const [po] = await DatabaseUtils.executeQuery(
                'SELECT * FROM purchase_orders WHERE id = ?',
                [id]
            );

            if (!po) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Purchase Order not found'
                });
            }

            // Update items
            await DatabaseUtils.executeQuery(
                'UPDATE purchase_orders SET items = ? WHERE id = ?',
                [JSON.stringify(items), id]
            );

            res.json({
                status: 'success',
                message: 'Purchase Order items updated successfully'
            });

        } catch (error) {
            logger.error('Error updating PO items:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error updating PO items',
                error: error.message
            });
        }
    }
}

module.exports = new PurchaseOrderController();