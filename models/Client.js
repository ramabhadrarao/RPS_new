// models/Client.js
const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  // Business Information
  businessType: {
    type: String,
    enum: ['Contract', 'Permanent', 'RPO'],
    required: true
  },
  subType: {
    type: String,
    enum: ['Contract', 'Contract MSP', 'Permanent', 'Permanent MSP', '']
  },
  businessDetails: {
    mspName: String,
    clientName: {
      type: String,
      required: true,
      index: true
    },
    mspPercentage: Number,
    aforvBillingPercentage: Number,
    clientPercentage: Number,
    industry: {
      type: String,
      required: true
    },
    website: String,
    linkedin: String,
    aboutUs: String,
    numberOfEmployees: Number,
    notes: String
  },
  
  // RPO Specific
  rpoEntries: [{
    skillCategory: String,
    expRange: String,
    invoiceValue: Number
  }],
  
  // Address Details
  addressDetails: {
    primaryAddress: {
      type: String,
      required: true
    },
    billingAddress: {
      type: String,
      required: true
    }
  },
  
  // Billing Information
  billingInfo: {
    gstNumber: {
      type: String,
      unique: true,
      sparse: true
    },
    paymentTerms: Number,
    billingRule: {
      type: String,
      enum: ['Per day', 'Per hour', 'Fixed']
    }
  },
  
  // Timesheet Configuration
  timesheetConfig: {
    timesheetType: {
      type: String,
      enum: ['Day', 'Hour']
    },
    fillingType: {
      type: String,
      enum: ['Portal', 'Manual']
    },
    portalName: String,
    workingHoursPerDay: Number,
    cutoffDate: Date,
    remarks: String
  },
  
  // Documents
  documents: {
    forCandidates: [{
      documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      },
      name: String,
      hasValidity: Boolean,
      startDate: Date,
      endDate: Date
    }],
    forClients: [{
      documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      },
      name: String,
      hasValidity: Boolean,
      startDate: Date,
      endDate: Date
    }]
  },
  
  // Leave Policy
  leavePolicy: {
    preProbation: mongoose.Schema.Types.Mixed,
    postProbation: mongoose.Schema.Types.Mixed
  },
  
  // Background Verification Policy
  verificationPolicy: {
    educationPolicy: {
      ssc: String,
      intermediate: String,
      diploma: String,
      graduation: String,
      pg: String
    },
    minEducationYears: Number,
    remarks: String,
    employmentPolicy: {
      remarks: String
    },
    blocklistUploads: {
      blocklistedCompaniesFileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      },
      blocklistedUniversitiesFileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      }
    }
  },
  
  // SPOC Details
  spocDetails: [{
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true
    },
    mobile: String,
    location: String,
    designation: String,
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active'
    },
    functionalRoles: [String],
    accountsHandled: [String]
  }],
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  deletedAt: Date
}, {
  timestamps: true
});

// Indexes
clientSchema.index({ 'businessDetails.clientName': 'text' });
clientSchema.index({ businessType: 1, isActive: 1 });
clientSchema.index({ createdAt: -1 });

// Virtual for client code
clientSchema.virtual('clientCode').get(function() {
  return `CL${this._id.toString().slice(-6).toUpperCase()}`;
});

module.exports = mongoose.model('Client', clientSchema);