const { Budget } = require('../models/Budget');
const { ValidationUtils } = require('../utils/validation');
const DatabaseUtils = require('../utils/database');
const emailService = require('../utils/email');
const { logger } = require('../utils/logger');

class BudgetController {
    // Create new budget allocation
    async createBudget(req, res) {
        try {
            const {
                department_id,
                fiscal_year,
                total_amount,
                notes
            } = req.body;

            // Validate budget data
            if (!ValidationUtils.isPositiveNumber(total_amount)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid budget amount'
                });
            }

            const result = await DatabaseUtils.withTransaction(async (connection) => {
                // Check if budget already exists for department and fiscal year
                const [existingBudget] = await connection.query(
                    'SELECT id FROM budgets WHERE department_id = ? AND fiscal_year = ?',
                    [department_id, fiscal_year]
                );

                if (existingBudget.length > 0) {
                    throw new Error('Budget already exists for this department and fiscal year');
                }

                // Create budget allocation
                const [budgetResult] = await connection.query(
                    `INSERT INTO budgets (
                        department_id, fiscal_year, total_amount,
                        allocated_amount, remaining_amount,
                        status, notes, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [department_id, fiscal_year, total_amount,
                     0, total_amount, 'active', notes, req.user.id]
                );

                // Log budget creation
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id,
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['BUDGET_CREATION', 'budget', budgetResult.insertId,
                     `Budget created for department ${department_id} - FY ${fiscal_year}`,
                     req.user.id]
                );

                return { id: budgetResult.insertId };
            });

            // Send notification to department head
            await emailService.sendBudgetAllocationNotification({
                departmentId: department_id,
                fiscalYear: fiscal_year,
                amount: total_amount
            });

            res.status(201).json({
                status: 'success',
                message: 'Budget created successfully',
                data: result
            });

        } catch (error) {
            logger.error('Error creating budget:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error creating budget',
                error: error.message
            });
        }
    }

    // Get all budgets with filtering and pagination
    async getAllBudgets(req, res) {
        try {
            const {
                page = 1,
                limit = 10,
                fiscal_year,
                department_id,
                status
            } = req.query;

            let query = `
                SELECT b.*, d.name as department_name,
                       u.username as created_by_name
                FROM budgets b
                LEFT JOIN departments d ON b.department_id = d.id
                LEFT JOIN users u ON b.created_by = u.id
                WHERE 1=1
            `;
            
            const params = [];

            if (fiscal_year) {
                query += ' AND b.fiscal_year = ?';
                params.push(fiscal_year);
            }

            if (department_id) {
                query += ' AND b.department_id = ?';
                params.push(department_id);
            }

            if (status) {
                query += ' AND b.status = ?';
                params.push(status);
            }

            const result = await DatabaseUtils.paginate(query, params, page, limit);
            res.json(result);

        } catch (error) {
            logger.error('Error fetching budgets:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching budgets',
                error: error.message
            });
        }
    }

    // Get department budget with utilization details
    async getDepartmentBudget(req, res) {
        try {
            const { department_id } = req.params;
            const { fiscal_year = new Date().getFullYear() } = req.query;

            const [budget] = await DatabaseUtils.executeQuery(
                `SELECT b.*,
                        (SELECT COUNT(*) FROM purchase_orders po 
                         WHERE po.department_id = b.department_id 
                         AND YEAR(po.created_at) = b.fiscal_year) as total_pos,
                        (SELECT SUM(total_amount) FROM purchase_orders po 
                         WHERE po.department_id = b.department_id 
                         AND YEAR(po.created_at) = b.fiscal_year
                         AND po.status != 'rejected') as total_spent
                 FROM budgets b
                 WHERE b.department_id = ? AND b.fiscal_year = ?`,
                [department_id, fiscal_year]
            );

            if (!budget) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Budget not found'
                });
            }

            // Calculate utilization percentage
            budget.utilization_percentage = 
                ((budget.total_amount - budget.remaining_amount) / budget.total_amount) * 100;

            res.json({
                status: 'success',
                data: budget
            });

        } catch (error) {
            logger.error('Error fetching department budget:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching department budget',
                error: error.message
            });
        }
    }

    // Transfer budget between departments
    async transferBudget(req, res) {
        try {
            const {
                from_department_id,
                to_department_id,
                amount,
                reason
            } = req.body;

            if (!ValidationUtils.isPositiveNumber(amount)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid transfer amount'
                });
            }

            await DatabaseUtils.withTransaction(async (connection) => {
                // Check source department budget
                const [sourceBudget] = await connection.query(
                    `SELECT * FROM budgets 
                     WHERE department_id = ? 
                     AND fiscal_year = YEAR(CURRENT_DATE)`,
                    [from_department_id]
                );

                if (sourceBudget[0].remaining_amount < amount) {
                    throw new Error('Insufficient budget for transfer');
                }

                // Update source department budget
                await connection.query(
                    `UPDATE budgets 
                     SET remaining_amount = remaining_amount - ?,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE department_id = ? 
                     AND fiscal_year = YEAR(CURRENT_DATE)`,
                    [amount, from_department_id]
                );

                // Update target department budget
                await connection.query(
                    `UPDATE budgets 
                     SET remaining_amount = remaining_amount + ?,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE department_id = ? 
                     AND fiscal_year = YEAR(CURRENT_DATE)`,
                    [amount, to_department_id]
                );

                // Log transfer
                await connection.query(
                    `INSERT INTO budget_transfers (
                        from_department_id, to_department_id,
                        amount, reason, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    [from_department_id, to_department_id,
                     amount, reason, req.user.id]
                );
            });

            // Send notifications
            await emailService.sendBudgetTransferNotification({
                fromDepartmentId: from_department_id,
                toDepartmentId: to_department_id,
                amount: amount
            });

            res.json({
                status: 'success',
                message: 'Budget transferred successfully'
            });

        } catch (error) {
            logger.error('Error transferring budget:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error transferring budget',
                error: error.message
            });
        }
    }

    // Get budget utilization report
    async getBudgetUtilization(req, res) {
        try {
            const { department_id } = req.params;
            const { fiscal_year = new Date().getFullYear() } = req.query;

            const [utilization] = await DatabaseUtils.executeQuery(
                `SELECT 
                    b.total_amount,
                    b.allocated_amount,
                    b.remaining_amount,
                    COUNT(po.id) as total_purchase_orders,
                    SUM(CASE WHEN po.status = 'approved' THEN po.total_amount ELSE 0 END) as approved_amount,
                    SUM(CASE WHEN po.status = 'pending' THEN po.total_amount ELSE 0 END) as pending_amount
                 FROM budgets b
                 LEFT JOIN purchase_orders po ON b.department_id = po.department_id
                    AND YEAR(po.created_at) = b.fiscal_year
                 WHERE b.department_id = ? 
                 AND b.fiscal_year = ?
                 GROUP BY b.id`,
                [department_id, fiscal_year]
            );

            if (!utilization) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Budget utilization data not found'
                });
            }

            res.json({
                status: 'success',
                data: utilization
            });

        } catch (error) {
            logger.error('Error fetching budget utilization:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching budget utilization',
                error: error.message
            });
        }
    }

    // Get budget history for department
    async getBudgetHistory(req, res) {
        try {
            const { department_id } = req.params;

            const [history] = await DatabaseUtils.executeQuery(
                `SELECT b.*, u.username as updated_by_name
                 FROM budget_history b
                 LEFT JOIN users u ON b.updated_by = u.id
                 WHERE b.department_id = ?
                 ORDER BY b.updated_at DESC`,
                [department_id]
            );

            res.json({
                status: 'success',
                data: history
            });

        } catch (error) {
            logger.error('Error fetching budget history:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching budget history',
                error: error.message
            });
        }
    }


    // Get fiscal year budget report
    async getFiscalYearReport(req, res) {
        try {
            const { year } = req.params;

            const [report] = await DatabaseUtils.executeQuery(
                `SELECT 
                    b.department_id,
                    d.name as department_name,
                    b.total_amount,
                    b.allocated_amount,
                    b.remaining_amount,
                    COUNT(po.id) as total_purchase_orders,
                    SUM(CASE WHEN po.status = 'approved' THEN po.total_amount ELSE 0 END) as approved_amount,
                    SUM(CASE WHEN po.status = 'pending' THEN po.total_amount ELSE 0 END) as pending_amount
                 FROM budgets b
                 LEFT JOIN departments d ON b.department_id = d.id
                 LEFT JOIN purchase_orders po ON b.department_id = po.department_id
                    AND YEAR(po.created_at) = b.fiscal_year
                 WHERE b.fiscal_year = ?
                 GROUP BY b.id`,
                [year]
            );

            res.json({
                status: 'success',
                data: report
            });

        } catch (error) {
            logger.error('Error fetching fiscal year report:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching fiscal year report',
                error: error.message
            });
        }
    }

    // Update budget allocation
    async updateBudget(req, res) {
        try {
            const { id } = req.params;
            const {
                total_amount,
                notes
            } = req.body;

            // Validate budget data
            if (!ValidationUtils.isPositiveNumber(total_amount)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid budget amount'
                });
            }

            const result = await DatabaseUtils.withTransaction(async (connection) => {
                // Update budget allocation
                const [budgetResult] = await connection.query(
                    `UPDATE budgets 
                     SET total_amount = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [total_amount, notes, id]
                );

                // Log budget update
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id,
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['BUDGET_UPDATE', 'budget', id,
                     `Budget updated for department ${id}`, req.user.id]
                );

                return { id: budgetResult.insertId };
            });

            res.json({
                status: 'success',
                message: 'Budget updated successfully',
                data: result
            });

        } catch (error) {
            logger.error('Error updating budget:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error updating budget',
                error: error.message
            });
        }
    }

    // Delete budget allocation
    async deleteBudget(req, res) {
        try {
            const { id } = req.params;

            const result = await DatabaseUtils.withTransaction(async (connection) => {
                // Delete budget allocation
                const [budgetResult] = await connection.query(
                    `DELETE FROM budgets WHERE id = ?`,
                    [id]
                );

                // Log budget deletion
                await connection.query(
                    `INSERT INTO audit_logs (
                        event_type, entity_type, entity_id,
                        description, created_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    ['BUDGET_DELETION', 'budget', id,
                     `Budget deleted for department ${id}`, req.user.id]
                );

                return { id: budgetResult.insertId };
            });

            res.json({
                status: 'success',
                message: 'Budget deleted successfully',
                data: result
            });

        } catch (error) {
            logger.error('Error deleting budget:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error deleting budget',
                error: error.message
            });
        }
    }

    // Allocate budget to department
    async allocateBudget(req, res) {
        try {
            const {
                department_id,
                amount,
                notes
            } = req.body;

            if (!ValidationUtils.isPositiveNumber(amount)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid allocation amount'
                });
            }

            await DatabaseUtils.withTransaction(async (connection) => {
                // Update department budget
                const [budgetResult] = await connection.query(
                    `UPDATE budgets 
                     SET allocated_amount = allocated_amount + ?,
                         remaining_amount = remaining_amount - ?,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE department_id = ? 
                     AND fiscal_year = YEAR(CURRENT_DATE)`,
                    [amount, amount, department_id]
                );

                // Log budget allocation
                await connection.query(
                    `INSERT INTO budget_allocations (
                        department_id, amount, notes, created_by
                    ) VALUES (?, ?, ?, ?)`,
                    [department_id, amount, notes, req.user.id]
                );
            });

            res.json({
                status: 'success',
                message: 'Budget allocated successfully'
            });

        } catch (error) {
            logger.error('Error allocating budget:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error allocating budget',
                error: error.message
            });
        }
    }

    // Get budget allocation by ID
    async getBudgetById(req, res) {
        try {
            const { id } = req.params;

            const [budget] = await DatabaseUtils.executeQuery(
                `SELECT b.*, d.name as department_name,
                        u.username as created_by_name
                 FROM budgets b
                 LEFT JOIN departments d ON b.department_id = d.id
                 LEFT JOIN users u ON b.created_by = u.id
                 WHERE b.id = ?`,
                [id]
            );

            if (!budget) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Budget not found'
                });
            }

            res.json({
                status: 'success',
                data: budget
            });

        } catch (error) {
            logger.error('Error fetching budget:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching budget',
                error: error.message
            });
        }
    }

    
}

module.exports = new BudgetController();