// models/BGVVendor.js
const mongoose = require('mongoose');

const bgvVendorSchema = new mongoose.Schema({
  // Vendor Details
  vendorName: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  website: {
    type: String,
    trim: true
  },
  
  // Client Association
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  
  // Address Details
  address: {
    type: String,
    required: true
  },
  billingAddress: {
    type: String,
    required: true
  },
  
  // Billing Information
  gstNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  invoicePaymentTerms: {
    type: Number,
    default: 30
  },
  
  // Documents
  documents: [{
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileDocument'
    },
    name: String,
    hasValidity: Boolean,
    startDate: Date,
    endDate: Date,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
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
    phone: String,
    designation: String,
    location: String,
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active'
    },
    functionalRoles: [String],
    accountsHandled: [String]
  }],
  
  // Services
  servicesOffered: {
    educationVerification: {
      type: Boolean,
      default: true
    },
    employmentVerification: {
      type: Boolean,
      default: true
    },
    addressVerification: {
      type: Boolean,
      default: true
    },
    criminalCheck: {
      type: Boolean,
      default: true
    },
    referenceCheck: {
      type: Boolean,
      default: true
    },
    drugTest: {
      type: Boolean,
      default: false
    },
    creditCheck: {
      type: Boolean,
      default: false
    }
  },
  
  // SLA Details
  slaDetails: {
    standardTAT: {
      type: Number,
      default: 7 // days
    },
    expressTAT: {
      type: Number,
      default: 3 // days
    },
    escalationMatrix: [{
      level: Number,
      escalationTo: String,
      timeframe: Number // hours
    }]
  },
  
  // Pricing
  pricing: {
    standard: {
      perCase: Number,
      bulkDiscount: {
        enabled: Boolean,
        tiers: [{
          minCases: Number,
          maxCases: Number,
          discountPercentage: Number
        }]
      }
    },
    express: {
      perCase: Number,
      surchargePercentage: Number
    }
  },
  
  // Performance Metrics
  performanceMetrics: {
    avgTATDays: Number,
    onTimeDeliveryRate: Number,
    accuracyRate: Number,
    lastUpdated: Date
  },
  
  // Status
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Suspended'],
    default: 'Active'
  },
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
bgvVendorSchema.index({ vendorName: 'text' });
bgvVendorSchema.index({ clientId: 1, status: 1 });

// Virtual for vendor code
bgvVendorSchema.virtual('vendorCode').get(function() {
  return `BGV${this._id.toString().slice(-6).toUpperCase()}`;
});

// Method to check document validity
bgvVendorSchema.methods.hasValidDocuments = function() {
  const now = new Date();
  return this.documents.every(doc => {
    if (!doc.hasValidity) return true;
    return doc.endDate > now;
  });
};

module.exports = mongoose.model('BGVVendor', bgvVendorSchema);