// models/FileDocument.js
const mongoose = require('mongoose');

const fileDocumentSchema = new mongoose.Schema({
  originalName: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true,
    unique: true
  },
  fileType: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  s3Key: {
    type: String,
    required: true,
    unique: true
  },
  bucket: {
    type: String,
    required: true
  },
  
  // File categorization
  category: {
    type: String,
    enum: [
      'resume', 'education_certificate', 'experience_letter', 
      'relieving_letter', 'payslip', 'bank_statement', 
      'offer_letter', 'kyc_document', 'photo', 
      'agreement', 'policy_document', 'other'
    ],
    required: true
  },
  
  // Entity association
  entityType: {
    type: String,
    enum: ['Candidate', 'Client', 'Requirement', 'BGVVendor', 'Agency', 'User'],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'entityType'
  },
  
  // Security and validation
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verifiedAt: Date,
  
  virusScanStatus: {
    type: String,
    enum: ['pending', 'clean', 'infected', 'error'],
    default: 'pending'
  },
  virusScanResult: mongoose.Schema.Types.Mixed,
  
  // Metadata
  metadata: {
    documentType: String,
    expiryDate: Date,
    issueDate: Date,
    issuingAuthority: String,
    documentNumber: String,
    additionalInfo: mongoose.Schema.Types.Mixed
  },
  
  // Access control
  accessLevel: {
    type: String,
    enum: ['public', 'internal', 'confidential', 'restricted'],
    default: 'internal'
  },
  allowedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Tracking
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastAccessedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastAccessedAt: Date,
  accessCount: {
    type: Number,
    default: 0
  },
  
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedAt: Date
}, {
  timestamps: true
});

// Indexes
fileDocumentSchema.index({ entityType: 1, entityId: 1 });
fileDocumentSchema.index({ category: 1 });
fileDocumentSchema.index({ uploadedBy: 1 });
fileDocumentSchema.index({ createdAt: -1 });

// Method to generate secure file URL
fileDocumentSchema.methods.getSecureUrl = function(expiresIn = 3600) {
  // Generate pre-signed URL for S3
  // Implementation depends on your S3 service
  return this.url; // Placeholder
};

module.exports = mongoose.model('FileDocument', fileDocumentSchema);