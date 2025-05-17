const { Vendor } = require('../models/Vendor');
const { ValidationUtils } = require('../utils/validation');
const emailService = require('../utils/email');
const DatabaseUtils = require('../utils/database');

class VendorController {
    // Create new vendor
    async registerVendor(req, res) {
        try {
            const {
                company_name,
                contact_person,
                email,
                phone,
                address,
                registration_number,
                tax_id,
                service_categories,
                certifications
            } = req.body;

            // Validate vendor data
            const validation = ValidationUtils.validateVendor(req.body);
            if (!validation.isValid) {
                return res.status(400).json({ errors: validation.errors });
            }

            // Check for existing vendor
            const existingVendor = await Vendor.findByEmail(email);
            if (existingVendor) {
                return res.status(400).json({ message: 'Vendor already registered' });
            }

            // Create vendor using stored procedure
            const result = await DatabaseUtils.executeQuery(
                'CALL RegisterVendor(?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [company_name, contact_person, email, phone, address, registration_number, tax_id,
                 JSON.stringify(service_categories), JSON.stringify(certifications)]
            );

            // Send welcome email to vendor
            await emailService.sendVendorWelcomeEmail({
                email,
                companyName: company_name,
                contactPerson: contact_person
            });

            res.status(201).json({
                message: 'Vendor registered successfully',
                vendorId: result.vendor_id
            });

        } catch (error) {
            res.status(500).json({ message: 'Error registering vendor', error: error.message });
        }
    }

    // Get all vendors with pagination and filters
    async getAllVendors(req, res) {
        try {
            const {
                page = 1,
                limit = 10,
                search,
                status,
                category
            } = req.query;

            let query = 'SELECT * FROM vendors WHERE 1=1';
            const params = [];

            if (search) {
                query += ' AND (company_name LIKE ? OR contact_person LIKE ?)';
                params.push(`%${search}%`, `%${search}%`);
            }

            if (status) {
                query += ' AND status = ?';
                params.push(status);
            }

            if (category) {
                query += ' AND JSON_CONTAINS(service_categories, ?)';
                params.push(`"${category}"`);
            }

            const result = await DatabaseUtils.paginate(query, params, page, limit);

            res.json(result);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching vendors', error: error.message });
        }
    }

    // Get vendor by ID
    async getVendorById(req, res) {
        try {
            const vendor = await Vendor.findById(req.params.id);
            if (!vendor) {
                return res.status(404).json({ message: 'Vendor not found' });
            }

            res.json(vendor);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching vendor', error: error.message });
        }
    }

    // Update vendor
    async updateVendor(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            // Validate update data
            const validation = ValidationUtils.validateVendor(updateData);
            if (!validation.isValid) {
                return res.status(400).json({ errors: validation.errors });
            }

            const updatedVendor = await Vendor.update(id, updateData);
            if (!updatedVendor) {
                return res.status(404).json({ message: 'Vendor not found' });
            }

            res.json({
                message: 'Vendor updated successfully',
                vendor: updatedVendor
            });
        } catch (error) {
            res.status(500).json({ message: 'Error updating vendor', error: error.message });
        }
    }

    // Delete vendor
    async deleteVendor(req, res) {
        try {
            const { id } = req.params;
            const result = await Vendor.delete(id);
            
            if (!result) {
                return res.status(404).json({ message: 'Vendor not found' });
            }

            res.json({ message: 'Vendor deleted successfully' });
        } catch (error) {
            res.status(500).json({ message: 'Error deleting vendor', error: error.message });
        }
    }

    // Get vendor performance
    async getVendorPerformance(req, res) {
        try {
            const { id } = req.params;
            const performance = await DatabaseUtils.executeQuery(
                'SELECT * FROM vendor_performances WHERE vendor_id = ? ORDER BY created_at DESC',
                [id]
            );

            res.json(performance);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching vendor performance', error: error.message });
        }
    }

    // Blacklist vendor
    async blacklistVendor(req, res) {
        try {
            const { id } = req.params;
            const { reason } = req.body;

            await DatabaseUtils.withTransaction(async (connection) => {
                // Update vendor status
                await connection.query(
                    'UPDATE vendors SET status = ?, blacklist_reason = ? WHERE id = ?',
                    ['blacklisted', reason, id]
                );

                // Log blacklist action
                await connection.query(
                    'INSERT INTO audit_logs (event_type, entity_type, entity_id, description, created_by) VALUES (?, ?, ?, ?, ?)',
                    ['VENDOR_BLACKLIST', 'vendor', id, reason, req.user.id]
                );
            });

            res.json({ message: 'Vendor blacklisted successfully' });
        } catch (error) {
            res.status(500).json({ message: 'Error blacklisting vendor', error: error.message });
        }
    }

    // Activate vendor
    async activateVendor(req, res) {
        try {
            const { id } = req.params;

            await DatabaseUtils.withTransaction(async (connection) => {
                // Update vendor status
                await connection.query(
                    'UPDATE vendors SET status = ?, blacklist_reason = NULL WHERE id = ?',
                    ['active', id]
                );

                // Log activation action
                await connection.query(
                    'INSERT INTO audit_logs (event_type, entity_type, entity_id, description, created_by) VALUES (?, ?, ?, ?, ?)',
                    ['VENDOR_ACTIVATE', 'vendor', id, 'Vendor activated', req.user.id]
                );
            });

            res.json({ message: 'Vendor activated successfully' });
        } catch (error) {
            res.status(500).json({ message: 'Error activating vendor', error: error.message });
        }
    }


    // Upload vendor documents
    async uploadVendorDocuments(req, res) {
        try {
            const { id } = req.params;
            const { documents } = req.body;

            // Validate documents
            const validation = ValidationUtils.validateVendorDocuments(documents);
            if (!validation.isValid) {
                return res.status(400).json({ errors: validation.errors });
            }

            // Update vendor documents
            await Vendor.update(id, { documents });

            res.json({ message: 'Vendor documents uploaded successfully' });
        } catch (error) {
            res.status(500).json({ message: 'Error uploading vendor documents', error: error.message });
        }
    }


    // Get vendor contracts
    async getVendorContracts(req, res) {
        try {
            const { id } = req.params;
            const contracts = await DatabaseUtils.executeQuery(
                'SELECT * FROM contracts WHERE vendor_id = ?',
                [id]
            );

            res.json(contracts);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching vendor contracts', error: error.message });
        }
    }


    // Get vendor purchase orders
    async getVendorPurchaseOrders(req, res) {
        try {
            const { id } = req.params;
            const purchaseOrders = await DatabaseUtils.executeQuery(
                'SELECT * FROM purchase_orders WHERE vendor_id = ?',
                [id]
            );

            res.json(purchaseOrders);
        } catch (error) {
            res.status(500).json({ message: 'Error fetching vendor purchase orders', error: error.message });
        }
    }
}

module.exports = new VendorController();