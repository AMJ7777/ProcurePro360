class Vendor {
    static async createTable() {
      const query = `
        CREATE TABLE IF NOT EXISTS vendors (
          id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          company_name VARCHAR(100) NOT NULL,
          contact_person VARCHAR(100) NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          phone VARCHAR(20),
          address TEXT,
          registration_number VARCHAR(50) UNIQUE,
          tax_id VARCHAR(50),
          service_categories JSON,
          certifications JSON,
          status ENUM('active', 'inactive', 'blacklisted') DEFAULT 'active',
          rating DECIMAL(3,2) DEFAULT 0.00,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_company_name (company_name),
          INDEX idx_email (email)
        )
      `;
      await pool.query(query);
    }
  }

      
     module.exports = Vendor;


