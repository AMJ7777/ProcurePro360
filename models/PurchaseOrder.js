const e = require("express");

class PurchaseOrder {
    static async createTable() {
      const query = `
        CREATE TABLE IF NOT EXISTS purchase_orders (
          id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          po_number VARCHAR(50) UNIQUE NOT NULL,
          vendor_id VARCHAR(36) NOT NULL,
          contract_id VARCHAR(36),
          department_id VARCHAR(36) NOT NULL,
          items JSON NOT NULL,
          total_amount DECIMAL(15,2) NOT NULL,
          status ENUM('draft', 'pending', 'approved', 'rejected', 'completed') DEFAULT 'draft',
          delivery_date DATE,
          delivery_address TEXT,
          special_instructions TEXT,
          approved_by VARCHAR(36),
          approved_at TIMESTAMP,
          created_by VARCHAR(36) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (vendor_id) REFERENCES vendors(id),
          FOREIGN KEY (contract_id) REFERENCES contracts(id),
          FOREIGN KEY (department_id) REFERENCES departments(id),
          FOREIGN KEY (created_by) REFERENCES users(id),
          FOREIGN KEY (approved_by) REFERENCES users(id),
          INDEX idx_po_number (po_number),
          INDEX idx_status (status)
        )
      `;
      await pool.query(query);
    }
  }

  module.exports = PurchaseOrder;