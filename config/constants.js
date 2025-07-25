// config/constants.js
module.exports = {
  app: {
    name: process.env.APP_NAME || 'ATS Platform',
    url: process.env.APP_URL || 'http://localhost:3000'
  },
  email: {
    from: process.env.EMAIL_FROM || 'noreply@ats.local'
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    allowedTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ]
  }
};