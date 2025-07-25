// models/Activity.js
const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['create', 'update', 'delete', 'status_change', 'assignment', 'note', 'document_upload'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  entityType: {
    type: String,
    enum: ['Candidate', 'Client', 'Requirement', 'BGVVendor', 'Agency'],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'entityType'
  },
  metadata: mongoose.Schema.Types.Mixed,
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true
});

activitySchema.index({ entityType: 1, entityId: 1 });
activitySchema.index({ performedBy: 1 });
activitySchema.index({ createdAt: -1 });

module.exports = mongoose.model('Activity', activitySchema);