const { Performance } = require('../models/Performance');
const { ValidationUtils } = require('../utils/validation');
const DatabaseUtils = require('../utils/database');
const emailService = require('../utils/email');
const { logger } = require('../utils/logger');

class PerformanceController {
    // Create new performance evaluation
    async createPerformanceReview(req, res) {
        try {
            const {
                vendor_id,
                contract_id,
                po_id,
                quality_rating,
                delivery_rating,
                communication_rating,
                pricing_rating,
                review_text
            } = req.body;

            // Validate ratings
            const ratings = [quality_rating, delivery_rating, communication_rating, pricing_rating];
            if (!ratings.every(rating => ValidationUtils.isInRange(rating, 0, 5))) {
                return res.status(400).json({
                    status: 'error',
                    message: 'All ratings must be between 0 and 5'
                });
            }

            // Execute performance evaluation stored procedure
            const result = await DatabaseUtils.executeQuery(
                'CALL EvaluateVendorPerformance(?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [vendor_id, contract_id, po_id, quality_rating, delivery_rating,
                 communication_rating, pricing_rating, review_text, req.user.id]
            );

            // Send notification if rating is below threshold
            const averageRating = (quality_rating + delivery_rating + 
                                 communication_rating + pricing_rating) / 4;
            if (averageRating < 3) {
                await emailService.sendLowPerformanceAlert({
                    vendorId: vendor_id,
                    rating: averageRating,
                    reviewerId: req.user.id
                });
            }

            res.status(201).json({
                status: 'success',
                message: 'Performance evaluation created successfully',
                data: result
            });

        } catch (error) {
            logger.error('Error creating performance review:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error creating performance review',
                error: error.message
            });
        }
    }

    // Get all performance reviews with filtering
    async getAllPerformanceReviews(req, res) {
        try {
            const {
                page = 1,
                limit = 10,
                vendor_id,
                category,
                start_date,
                end_date,
                rating_min,
                rating_max
            } = req.query;

            let query = `
                SELECT p.*, v.company_name as vendor_name,
                       u.username as reviewed_by_name,
                       c.contract_number,
                       po.po_number
                FROM vendor_performances p
                LEFT JOIN vendors v ON p.vendor_id = v.id
                LEFT JOIN users u ON p.reviewed_by = u.id
                LEFT JOIN contracts c ON p.contract_id = c.id
                LEFT JOIN purchase_orders po ON p.po_id = po.id
                WHERE 1=1
            `;
            
            const params = [];

            // Apply filters
            if (vendor_id) {
                query += ' AND p.vendor_id = ?';
                params.push(vendor_id);
            }

            if (category) {
                query += ' AND p.category = ?';
                params.push(category);
            }

            if (start_date) {
                query += ' AND p.created_at >= ?';
                params.push(start_date);
            }

            if (end_date) {
                query += ' AND p.created_at <= ?';
                params.push(end_date);
            }

            if (rating_min) {
                query += ' AND p.rating >= ?';
                params.push(rating_min);
            }

            if (rating_max) {
                query += ' AND p.rating <= ?';
                params.push(rating_max);
            }

            const result = await DatabaseUtils.paginate(query, params, page, limit);
            res.json(result);

        } catch (error) {
            logger.error('Error fetching performance reviews:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching performance reviews',
                error: error.message
            });
        }
    }

    // Get vendor's performance history
    async getVendorPerformance(req, res) {
        try {
            const { vendor_id } = req.params;
            const { period = '1year' } = req.query;

            let dateCondition;
            switch (period) {
                case '3months':
                    dateCondition = 'INTERVAL 3 MONTH';
                    break;
                case '6months':
                    dateCondition = 'INTERVAL 6 MONTH';
                    break;
                case '1year':
                default:
                    dateCondition = 'INTERVAL 1 YEAR';
            }

            const [performance] = await DatabaseUtils.executeQuery(
                `SELECT 
                    AVG(CASE WHEN category = 'quality' THEN rating END) as avg_quality,
                    AVG(CASE WHEN category = 'delivery' THEN rating END) as avg_delivery,
                    AVG(CASE WHEN category = 'communication' THEN rating END) as avg_communication,
                    AVG(CASE WHEN category = 'pricing' THEN rating END) as avg_pricing,
                    AVG(CASE WHEN category = 'overall' THEN rating END) as avg_overall,
                    COUNT(DISTINCT contract_id) as total_contracts,
                    COUNT(DISTINCT po_id) as total_pos,
                    MIN(rating) as lowest_rating,
                    MAX(rating) as highest_rating
                 FROM vendor_performances
                 WHERE vendor_id = ?
                 AND created_at >= DATE_SUB(CURRENT_DATE, ${dateCondition})`,
                [vendor_id]
            );

            // Get recent reviews
            const [recentReviews] = await DatabaseUtils.executeQuery(
                `SELECT p.*, u.username as reviewer_name
                 FROM vendor_performances p
                 LEFT JOIN users u ON p.reviewed_by = u.id
                 WHERE p.vendor_id = ?
                 AND p.category = 'overall'
                 ORDER BY p.created_at DESC
                 LIMIT 5`,
                [vendor_id]
            );

            res.json({
                status: 'success',
                data: {
                    summary: performance,
                    recentReviews
                }
            });

        } catch (error) {
            logger.error('Error fetching vendor performance:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching vendor performance',
                error: error.message
            });
        }
    }

    // Get performance metrics and reports
    async getPerformanceMetrics(req, res) {
        try {
            const { period = '1year' } = req.query;

            const metrics = await DatabaseUtils.withTransaction(async (connection) => {
                // Get top performing vendors
                const [topVendors] = await connection.query(
                    `SELECT v.id, v.company_name,
                            AVG(p.rating) as avg_rating,
                            COUNT(DISTINCT p.id) as review_count
                     FROM vendors v
                     JOIN vendor_performances p ON v.id = p.vendor_id
                     WHERE p.category = 'overall'
                     GROUP BY v.id
                     HAVING review_count >= 5
                     ORDER BY avg_rating DESC
                     LIMIT 10`
                );

                // Get performance trends
                const [trends] = await connection.query(
                    `SELECT 
                        DATE_FORMAT(created_at, '%Y-%m') as month,
                        AVG(rating) as avg_rating,
                        COUNT(*) as review_count
                     FROM vendor_performances
                     WHERE category = 'overall'
                     GROUP BY month
                     ORDER BY month DESC
                     LIMIT 12`
                );

                // Get category-wise performance
                const [categoryPerformance] = await connection.query(
                    `SELECT 
                        category,
                        AVG(rating) as avg_rating,
                        COUNT(*) as review_count
                     FROM vendor_performances
                     WHERE category != 'overall'
                     GROUP BY category`
                );

                return {
                    topVendors,
                    trends,
                    categoryPerformance
                };
            });

            res.json({
                status: 'success',
                data: metrics
            });

        } catch (error) {
            logger.error('Error fetching performance metrics:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching performance metrics',
                error: error.message
            });
        }
    }

    // Update performance review
    async updatePerformanceReview(req, res) {
        try {
            const { id } = req.params;
            const {
                quality_rating,
                delivery_rating,
                communication_rating,
                pricing_rating,
                review_text
            } = req.body;

            // Validate ratings
            const ratings = [quality_rating, delivery_rating, communication_rating, pricing_rating];
            if (!ratings.every(rating => ValidationUtils.isInRange(rating, 0, 5))) {
                return res.status(400).json({
                    status: 'error',
                    message: 'All ratings must be between 0 and 5'
                });
            }

            // Execute performance update stored procedure
            const result = await DatabaseUtils.executeQuery(
                'CALL UpdateVendorPerformance(?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [id, quality_rating, delivery_rating, communication_rating,
                 pricing_rating, review_text, req.user.id]
            );

            res.json({
                status: 'success',
                message: 'Performance evaluation updated successfully',
                data: result
            });

        } catch (error) {
            logger.error('Error updating performance review:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error updating performance review',
                error: error.message
            });
        }
    }

    // Delete performance review
    async deletePerformanceReview(req, res) {
        try {
            const { id } = req.params;

            // Execute performance delete stored procedure
            const result = await DatabaseUtils.executeQuery(
                'CALL DeleteVendorPerformance(?, ?)',
                [id, req.user.id]
            );

            res.json({
                status: 'success',
                message: 'Performance evaluation deleted successfully',
                data: result
            });

        } catch (error) {
            logger.error('Error deleting performance review:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error deleting performance review',
                error: error.message
            });
        }
    }

    // Generate performance report
    async generatePerformanceReport(req, res) {
        try {
            const { start_date, end_date } = req.query;

            // Execute performance report stored procedure
            const [report] = await DatabaseUtils.executeQuery(
                'CALL GeneratePerformanceReport(?, ?)',
                [start_date, end_date]
            );

            res.json({
                status: 'success',
                data: report
            });

        } catch (error) {
            logger.error('Error generating performance report:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error generating performance report',
                error: error.message
            });
        }
    }

    // Get top performing vendors
    async getTopPerformingVendors(req, res) {
        try {
            const { limit = 10 } = req.query;

            // Execute top vendors stored procedure
            const [topVendors] = await DatabaseUtils.executeQuery(
                'CALL GetTopPerformingVendors(?)',
                [limit]
            );

            res.json({
                status: 'success',
                data: topVendors
            });

        } catch (error) {
            logger.error('Error fetching top performing vendors:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching top performing vendors',
                error: error.message
            });
        }
    }

    // Get department-specific vendor performance
    async getDepartmentVendorPerformance(req, res) {
        try {
            const { departmentId } = req.params;
            const { period = '1year' } = req.query;

            // Execute department performance stored procedure
            const [performance] = await DatabaseUtils.executeQuery(
                `CALL GetDepartmentVendorPerformance(?, ?)`,
                [departmentId, period]
            );

            res.json({
                status: 'success',
                data: performance
            });

        } catch (error) {
            logger.error('Error fetching department vendor performance:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching department vendor performance',
                error: error.message
            });
        }
    }

    // Get performance history for a vendor
    async getPerformanceHistory(req, res) {
        try {
            const { vendorId } = req.params;

            // Execute performance history stored procedure
            const [history] = await DatabaseUtils.executeQuery(
                `CALL GetVendorPerformanceHistory(?)`,
                [vendorId]
            );

            res.json({
                status: 'success',
                data: history
            });

        } catch (error) {
            logger.error('Error fetching vendor performance history:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching vendor performance history',
                error: error.message
            });
        }
    }

    // Get performance review by ID
    async getPerformanceReviewById(req, res) {
        try {
            const { id } = req.params;

            // Execute performance review stored procedure
            const [review] = await DatabaseUtils.executeQuery(
                `SELECT p.*, v.company_name as vendor_name,
                        u.username as reviewed_by_name,
                        c.contract_number,
                        po.po_number
                 FROM vendor_performances p
                 LEFT JOIN vendors v ON p.vendor_id = v.id
                 LEFT JOIN users u ON p.reviewed_by = u.id
                 LEFT JOIN contracts c ON p.contract_id = c.id
                 LEFT JOIN purchase_orders po ON p.po_id = po.id
                 WHERE p.id = ?`,
                [id]
            );

            res.json({
                status: 'success',
                data: review
            });

        } catch (error) {
            logger.error('Error fetching performance review:', error);
            res.status(500).json({
                status: 'error',
                message: 'Error fetching performance review',
                error: error.message
            });
        }
    }



}

module.exports = new PerformanceController();