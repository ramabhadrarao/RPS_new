// middleware/upload.js
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../utils/appError');
const FileService = require('../services/fileService');

// Memory storage for processing before S3 upload
const multerStorage = multer.memoryStorage();

// File filter
const multerFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('File type not allowed', 400), false);
  }
};

// Configure multer
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Upload single file
exports.uploadSingle = (fieldName) => upload.single(fieldName);

// Upload multiple files
exports.uploadMultiple = (fieldName, maxCount) => upload.array(fieldName, maxCount);

// Upload fields
exports.uploadFields = (fields) => upload.fields(fields);

// Resize and optimize images
exports.resizeImage = (width, height) => {
  return async (req, res, next) => {
    if (!req.file || !req.file.mimetype.startsWith('image')) {
      return next();
    }
    
    try {
      const filename = `${uuidv4()}.jpeg`;
      
      await sharp(req.file.buffer)
        .resize(width, height)
        .toFormat('jpeg')
        .jpeg({ quality: 90 })
        .toBuffer()
        .then(buffer => {
          req.file.buffer = buffer;
          req.file.mimetype = 'image/jpeg';
          req.file.originalname = filename;
        });
      
      next();
    } catch (error) {
      next(new AppError('Error processing image', 500));
    }
  };
};

// Validate file size and type per field
exports.validateFiles = (rules) => {
  return (req, res, next) => {
    if (!req.files) return next();
    
    for (const [fieldName, files] of Object.entries(req.files)) {
      const rule = rules[fieldName];
      if (!rule) continue;
      
      for (const file of files) {
        // Check file size
        if (rule.maxSize && file.size > rule.maxSize) {
          return next(new AppError(`File size exceeds limit for ${fieldName}`, 400));
        }
        
        // Check file type
        if (rule.allowedTypes && !rule.allowedTypes.includes(file.mimetype)) {
          return next(new AppError(`Invalid file type for ${fieldName}`, 400));
        }
      }
    }
    
    next();
  };
};

// Scan files for viruses
exports.scanFiles = async (req, res, next) => {
  if (!req.files && !req.file) return next();
  
  try {
    const files = req.file ? [req.file] : Object.values(req.files).flat();
    
    for (const file of files) {
      // Implement virus scanning logic here
      // For now, we'll just check file headers for basic validation
      const isValid = await FileService.validateFileHeader(file.buffer, file.mimetype);
      
      if (!isValid) {
        return next(new AppError('File appears to be corrupted or invalid', 400));
      }
    }
    
    next();
  } catch (error) {
    next(new AppError('Error scanning files', 500));
  }
};

// Clean filename
exports.cleanFilename = (req, res, next) => {
  const cleanName = (filename) => {
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');
  };
  
  if (req.file) {
    req.file.cleanName = cleanName(req.file.originalname);
  }
  
  if (req.files) {
    if (Array.isArray(req.files)) {
      req.files.forEach(file => {
        file.cleanName = cleanName(file.originalname);
      });
    } else {
      Object.values(req.files).flat().forEach(file => {
        file.cleanName = cleanName(file.originalname);
      });
    }
  }
  
  next();
};