// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/database');
const routes = require('./routes');
const { globalErrorHandler } = require('./middleware/errorHandler');
const { setupSecurity } = require('./middleware/security');
const { serveFile } = require('./middleware/serveFiles');
const { isLoggedIn } = require('./middleware/auth');

// Initialize express app
const app = express();

// Connect to MongoDB
connectDB();

// Trust proxy
app.set('trust proxy', 1);

// Security middleware
setupSecurity(app);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Compression middleware
app.use(compression());

// Serve uploaded files with access control
// Apply authentication check for non-public files
app.use('/uploads', isLoggedIn, serveFile);

// API routes
app.use(routes);

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// Global error handler
app.use(globalErrorHandler);

// Handle unhandled routes
app.all('*', (req, res) => {
  res.status(404).json({
    status: 'fail',
    message: `Can't find ${req.originalUrl} on this server!`
  });
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`Files will be stored locally in: ${path.join(__dirname, 'uploads')}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  console.log('SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    console.log('Process terminated!');
  });
});

// Schedule cleanup tasks
const { FileService } = require('./services/fileService');

// Run cleanup every day at 2 AM
setInterval(async () => {
  const hour = new Date().getHours();
  if (hour === 2) {
    try {
      await FileService.cleanupDeletedFiles();
      console.log('File cleanup completed');
    } catch (error) {
      console.error('File cleanup error:', error);
    }
  }
}, 60 * 60 * 1000); // Check every hour

module.exports = app;