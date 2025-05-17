const e = require("express");

class Performance {
    static async createTable() {
      const query = `
        CREATE TABLE IF NOT EXISTS vendor_performances (
          id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          vendor_id VARCHAR(36) NOT NULL,
          contract_id VARCHAR(36),
          po_id VARCHAR(36),
          rating DECIMAL(3,2) NOT NULL,
          category ENUM('quality', 'delivery', 'communication', 'pricing', 'overall') NOT NULL,
          review_text TEXT,
          reviewed_by VARCHAR(36) NOT NULL,
          review_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
          FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL,
          FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
          FOREIGN KEY (reviewed_by) REFERENCES users(id),
          INDEX idx_vendor_id (vendor_id),
          INDEX idx_category (category)
        )
      `;
      await pool.query(query);
    }
  }

  module.exports = Performance;

