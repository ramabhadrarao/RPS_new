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

// Password reset form route (non-API route)
app.get('/reset-password/:token', (req, res) => {
  // Redirect to the API route that serves the form
  res.redirect(`/api/v1/auth/reset-password/${req.params.token}`);
});

// Alternatively, if you want to handle it directly in server.js:
app.get('/reset-password/:token', (req, res) => {
  const token = req.params.token;
  const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Reset Password - ATS Platform</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 400px;
      width: 100%;
    }
    h1 {
      color: #2563eb;
      margin-bottom: 20px;
    }
    .form-group {
      margin-bottom: 20px;
      text-align: left;
    }
    label {
      display: block;
      margin-bottom: 5px;
      color: #374151;
      font-weight: 500;
    }
    input {
      width: 100%;
      padding: 10px;
      border: 1px solid #d1d5db;
      border-radius: 5px;
      font-size: 16px;
      box-sizing: border-box;
    }
    input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }
    .btn {
      background-color: #2563eb;
      color: white;
      padding: 12px 30px;
      border: none;
      border-radius: 5px;
      font-size: 16px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      margin: 10px 0;
      width: 100%;
    }
    .btn:hover {
      background-color: #1d4ed8;
    }
    .btn:disabled {
      background-color: #9ca3af;
      cursor: not-allowed;
    }
    .message {
      margin: 20px 0;
      padding: 15px;
      border-radius: 5px;
    }
    .success {
      background-color: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    .error {
      background-color: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    .spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #2563eb;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .password-requirements {
      font-size: 12px;
      color: #6b7280;
      margin-top: 5px;
      text-align: left;
    }
    .requirement {
      margin: 2px 0;
    }
    .requirement.valid {
      color: #10b981;
    }
    .requirement.invalid {
      color: #ef4444;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Reset Your Password</h1>
    <p>Enter your new password below</p>
    
    <div id="content">
      <form id="resetForm">
        <div class="form-group">
          <label for="password">New Password</label>
          <input 
            type="password" 
            id="password" 
            name="password" 
            required
            placeholder="Enter new password"
          >
          <div class="password-requirements">
            <div class="requirement" id="req-length">• At least 8 characters</div>
            <div class="requirement" id="req-upper">• One uppercase letter</div>
            <div class="requirement" id="req-lower">• One lowercase letter</div>
            <div class="requirement" id="req-number">• One number</div>
            <div class="requirement" id="req-special">• One special character</div>
          </div>
        </div>
        
        <div class="form-group">
          <label for="confirmPassword">Confirm Password</label>
          <input 
            type="password" 
            id="confirmPassword" 
            name="confirmPassword" 
            required
            placeholder="Confirm new password"
          >
        </div>
        
        <button type="submit" class="btn" id="submitBtn">Reset Password</button>
      </form>
    </div>
    
    <div id="loading" style="display: none;">
      <div class="spinner"></div>
      <p>Resetting your password...</p>
    </div>
    
    <div id="result"></div>
  </div>
  
  <script>
    const password = document.getElementById('password');
    const confirmPassword = document.getElementById('confirmPassword');
    const submitBtn = document.getElementById('submitBtn');
    
    // Password validation
    function validatePassword(pass) {
      const requirements = {
        length: pass.length >= 8,
        upper: /[A-Z]/.test(pass),
        lower: /[a-z]/.test(pass),
        number: /[0-9]/.test(pass),
        special: /[!@#$%^&*]/.test(pass)
      };
      
      // Update UI
      document.getElementById('req-length').className = 'requirement ' + (requirements.length ? 'valid' : 'invalid');
      document.getElementById('req-upper').className = 'requirement ' + (requirements.upper ? 'valid' : 'invalid');
      document.getElementById('req-lower').className = 'requirement ' + (requirements.lower ? 'valid' : 'invalid');
      document.getElementById('req-number').className = 'requirement ' + (requirements.number ? 'valid' : 'invalid');
      document.getElementById('req-special').className = 'requirement ' + (requirements.special ? 'valid' : 'invalid');
      
      return Object.values(requirements).every(req => req === true);
    }
    
    password.addEventListener('input', (e) => {
      validatePassword(e.target.value);
    });
    
    document.getElementById('resetForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const passwordValue = password.value;
      const confirmValue = confirmPassword.value;
      
      // Validate password
      if (!validatePassword(passwordValue)) {
        document.getElementById('result').innerHTML = 
          '<div class="message error">Please meet all password requirements</div>';
        return;
      }
      
      // Check passwords match
      if (passwordValue !== confirmValue) {
        document.getElementById('result').innerHTML = 
          '<div class="message error">Passwords do not match</div>';
        return;
      }
      
      document.getElementById('content').style.display = 'none';
      document.getElementById('loading').style.display = 'block';
      document.getElementById('result').innerHTML = '';
      
      try {
        const response = await fetch('${appUrl}/api/v1/auth/reset-password/${token}', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ password: passwordValue }),
          credentials: 'include'
        });
        
        const data = await response.json();
        
        document.getElementById('loading').style.display = 'none';
        
        if (data.status === 'success') {
          document.getElementById('result').innerHTML = 
            '<div class="message success">' + 
            '<h2>✓ Password Reset Successfully!</h2>' +
            '<p>You have been logged in with your new password.</p>' +
            '<a href="${appUrl}" class="btn">Go to Dashboard</a>' +
            '</div>';
        } else {
          throw new Error(data.message || 'Password reset failed');
        }
      } catch (error) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
        document.getElementById('result').innerHTML = 
          '<div class="message error">' + 
          '<p>Error: ' + error.message + '</p>' +
          '<p>The reset link may have expired. Please request a new one.</p>' +
          '</div>';
      }
    });
  </script>
</body>
</html>
  `;
  
  res.status(200).type('html').send(html);
});
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