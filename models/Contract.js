class Contract {
    static async createTable() {
      const query = `
        CREATE TABLE IF NOT EXISTS contracts (
          id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          vendor_id VARCHAR(36) NOT NULL,
          contract_number VARCHAR(50) UNIQUE NOT NULL,
          title VARCHAR(200) NOT NULL,
          description TEXT,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          value DECIMAL(15,2) NOT NULL,
          status ENUM('draft', 'active', 'expired', 'terminated') DEFAULT 'draft',
          terms_conditions TEXT,
          renewal_terms TEXT,
          document_urls JSON,
          created_by VARCHAR(36) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id),
          INDEX idx_vendor_id (vendor_id),
          INDEX idx_status (status),
          INDEX idx_dates (start_date, end_date)
        )
      `;
      await pool.query(query);
    }
  }

  
    module.exports = Contract;