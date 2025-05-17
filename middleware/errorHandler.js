const { logger } = require('../utils/logger');

// Custom error class for operational errors
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Different error handling for development and production
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    sendErrorProd(err, res);
  }
};

// Development error response
const sendErrorDev = (err, res) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString()
  });

  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack
  });
};

// Production error response
const sendErrorProd = (err, res) => {
  // Log error
  logger.error({
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString()
  });

  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  } 
  // Programming or other unknown error: don't leak error details
  else {
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong'
    });
  }
};

// Handle specific types of errors
const handleDBError = (err) => {
  let message = 'Database operation failed';
  
  if (err.code === 'ER_DUP_ENTRY') {
    message = 'Duplicate entry found';
  } else if (err.code === 'ER_NO_REFERENCED_ROW') {
    message = 'Referenced record not found';
  }

  return new AppError(message, 400);
};

const handleValidationError = (err) => {
  const message = Object.values(err.errors).map(val => val.message).join('. ');
  return new AppError(message, 400);
};

const handleJWTError = () => {
  return new AppError('Invalid token. Please log in again', 401);
};

const handleJWTExpiredError = () => {
  return new AppError('Your token has expired. Please log in again', 401);
};

// Global unhandled rejection handler
process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});

module.exports = {
  AppError,
  errorHandler,
  handleDBError,
  handleValidationError,
  handleJWTError,
  handleJWTExpiredError
};