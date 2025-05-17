const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Define log levels
const levels = {
    error: 0,    // System errors, critical issues
    warn: 1,     // Warnings, non-critical issues
    info: 2,     // General information, successful operations
    http: 3,     // HTTP request logs
    debug: 4     // Debug information
};

// Define colors for each level
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'cyan'
};

// Set up Winston colors
winston.addColors(colors);

// Custom Format for Console Output
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
        let metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
    })
);

// Custom Format for File Output
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Create Daily Rotate File transports
const createFileTransport = (level) => {
    return new DailyRotateFile({
        dirname: path.join(__dirname, '../logs'),
        filename: `%DATE%-${level}.log`,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
        level,
        format: fileFormat
    });
};

// Create the logger
const logger = winston.createLogger({
    levels,
    format: winston.format.combine(
        winston.format.errors({ stack: true }),
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        // Console transport for all logs in development
        new winston.transports.Console({
            level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
            format: consoleFormat
        }),
        // File transports for different log levels
        createFileTransport('error'),
        createFileTransport('warn'),
        createFileTransport('info'),
        createFileTransport('http'),
        process.env.NODE_ENV === 'development' && createFileTransport('debug')
    ].filter(Boolean)
});

// HTTP Request Logger
const httpLogger = (req, res, next) => {
    // Start timer
    const start = Date.now();

    // Log when response finishes
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.http({
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: `${duration}ms`,
            userIp: req.ip,
            userAgent: req.get('user-agent')
        });
    });

    next();
};

// Error Logger
const errorLogger = (error, req, res, next) => {
    logger.error({
        message: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        body: req.body,
        params: req.params,
        query: req.query,
        user: req.user ? req.user.id : 'anonymous'
    });

    next(error);
};

// Performance Logger
const performanceLogger = {
    start: (label) => {
        if (process.env.NODE_ENV === 'development') {
            console.time(label);
        }
    },
    end: (label) => {
        if (process.env.NODE_ENV === 'development') {
            console.timeEnd(label);
        }
    }
};

// Database Query Logger
const queryLogger = (query, parameters) => {
    logger.debug({
        type: 'database_query',
        query,
        parameters,
        timestamp: new Date().toISOString()
    });
};

// Audit Logger for important operations
const auditLogger = (userId, action, details) => {
    logger.info({
        type: 'audit',
        userId,
        action,
        details,
        timestamp: new Date().toISOString()
    });
};

// Security Logger for authentication and authorization events
const securityLogger = (event) => {
    logger.warn({
        type: 'security',
        ...event,
        timestamp: new Date().toISOString()
    });
};

// Export all logging utilities
module.exports = {
    logger,
    httpLogger,
    errorLogger,
    performanceLogger,
    queryLogger,
    auditLogger,
    securityLogger,
    // Helper methods for common logging patterns
    logError: (error, context = {}) => {
        logger.error({
            message: error.message,
            stack: error.stack,
            ...context
        });
    },
    logInfo: (message, data = {}) => {
        logger.info({
            message,
            ...data
        });
    },
    logWarning: (message, data = {}) => {
        logger.warn({
            message,
            ...data
        });
    },
    logDebug: (message, data = {}) => {
        logger.debug({
            message,
            ...data
        });
    }
};

// Example usage:
/*
const { logger, auditLogger, queryLogger } = require('./utils/logger');

// Basic logging
logger.info('Application started');
logger.error('An error occurred', { error: err });
logger.debug('Debug information', { data: someData });

// HTTP request logging
app.use(httpLogger);

// Error logging
app.use(errorLogger);

// Audit logging
auditLogger(userId, 'USER_LOGIN', { ip: userIp });

// Query logging
queryLogger('SELECT * FROM users WHERE id = ?', [userId]);

// Performance monitoring
performanceLogger.start('operation');
// ... some operation
performanceLogger.end('operation');

// Security logging
securityLogger({
    event: 'FAILED_LOGIN_ATTEMPT',
    userId: 'unknown',
    ip: '192.168.1.1'
});
*/