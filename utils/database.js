const { pool } = require('../config/database');
const { logger } = require('./logger');

class DatabaseUtils {
  // Transaction wrapper
  static async withTransaction(callback) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      logger.error('Transaction failed:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // Generic query executor with error handling
  static async executeQuery(query, params = []) {
    try {
      const [results] = await pool.query(query, params);
      return results;
    } catch (error) {
      logger.error('Query execution failed:', { query, error });
      throw error;
    }
  }

  // Batch insert operation
  static async batchInsert(table, columns, values) {
    const placeholders = values.map(() => 
      `(${new Array(columns.length).fill('?').join(',')})`
    ).join(',');

    const query = `
      INSERT INTO ${table} (${columns.join(',')}) 
      VALUES ${placeholders}
    `;

    return await this.executeQuery(query, values.flat());
  }

  // Pagination helper
  static async paginate(query, params = [], page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const countQuery = query.replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM')
                           .split('ORDER BY')[0];

    const [countResult] = await pool.query(countQuery, params);
    const [data] = await pool.query(`${query} LIMIT ? OFFSET ?`, [...params, limit, offset]);

    return {
      data,
      pagination: {
        total: countResult[0].total,
        page: parseInt(page),
        pages: Math.ceil(countResult[0].total / limit),
        limit: parseInt(limit)
      }
    };
  }

  // Search helper
  static buildSearchQuery(baseQuery, searchFields, searchTerm) {
    if (!searchTerm) return { query: baseQuery, params: [] };

    const searchConditions = searchFields.map(field => `${field} LIKE ?`);
    const searchParams = searchFields.map(() => `%${searchTerm}%`);

    const query = `${baseQuery} WHERE ${searchConditions.join(' OR ')}`;
    return { query, params: searchParams };
  }

  // Backup and restore utilities
  static async backupTable(tableName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupTable = `${tableName}_backup_${timestamp}`;
    
    await this.executeQuery(`CREATE TABLE ${backupTable} LIKE ${tableName}`);
    await this.executeQuery(`INSERT INTO ${backupTable} SELECT * FROM ${tableName}`);
    
    return backupTable;
  }

  // Health check
  static async checkDatabaseHealth() {
    try {
      await pool.query('SELECT 1');
      return { status: 'healthy', timestamp: new Date() };
    } catch (error) {
      logger.error('Database health check failed:', error);
      return { status: 'unhealthy', error: error.message, timestamp: new Date() };
    }
  }
}

module.exports = DatabaseUtils;