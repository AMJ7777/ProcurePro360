const e = require("express");

class Department {
    static async createTable() {
      const query = `
        CREATE TABLE IF NOT EXISTS departments (
          id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
          name VARCHAR(100) UNIQUE NOT NULL,
          code VARCHAR(20) UNIQUE NOT NULL,
          description TEXT,
          head_id VARCHAR(36),
          parent_department_id VARCHAR(36),
          budget_center_code VARCHAR(50),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (head_id) REFERENCES users(id) ON DELETE SET NULL,
          FOREIGN KEY (parent_department_id) REFERENCES departments(id) ON DELETE SET NULL
        )
      `;
      await pool.query(query);
    }
  }

  module.exports = Department;