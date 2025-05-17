class Budget {
    static async createTable() {
      const query = `
        CREATE TABLE IF NOT EXISTS budgets (
          id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          department_id VARCHAR(36) NOT NULL,
          fiscal_year YEAR NOT NULL,
          total_amount DECIMAL(15,2) NOT NULL,
          allocated_amount DECIMAL(15,2) NOT NULL,
          remaining_amount DECIMAL(15,2) NOT NULL,
          status ENUM('active', 'exhausted', 'closed') DEFAULT 'active',
          notes TEXT,
          created_by VARCHAR(36) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (department_id) REFERENCES departments(id),
          FOREIGN KEY (created_by) REFERENCES users(id),
          UNIQUE KEY unique_dept_year (department_id, fiscal_year)
        )
      `;
      await pool.query(query);
    }
  }

module.exports = Budget;