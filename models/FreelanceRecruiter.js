// models/FreelanceRecruiter.js
const mongoose = require('mongoose');

const freelanceRecruiterSchema = new mongoose.Schema({
  // Personal Details
  personalDetails: {
    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true
    },
    mobile: {
      type: String,
      required: true
    },
    alternateContact: String,
    linkedIn: String,
    city: String,
    state: String,
    preferredCommTime: String
  },
  
  // Experience & Skills
  experience: {
    totalYears: Number,
    coreAreas: [String],
    keySkills: [String],
    industries: [String],
    hiringTypes: [{
      type: String,
      enum: ['Permanent', 'Contract', 'Both']
    }],
    recruitmentTools: [String],
    languages: [String]
  },
  
  // Availability & Commitment
  availability: {
    dailyHours: Number,
    daysPerWeek: Number,
    willingForExclusive: Boolean,
    positionsCanHandle: Number
  },
  
  // Commercials
  commercials: {
    expectedPayoutPercentage: Number,
    preferredPaymentMode: {
      type: String,
      enum: ['Bank Transfer', 'UPI']
    },
    payoutTerms: String,
    gstRegistered: Boolean,
    panNumber: {
      type: String,
      unique: true,
      sparse: true
    },
    bankDetails: {
      accountNumber: {
        type: String,
        select: false
      },
      ifscCode: String,
      upiId: String
    }
  },
  
  // Documents
  documents: {
    panCard: {
      uploaded: Boolean,
      documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      }
    },
    resume: {
      uploaded: Boolean,
      documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      }
    },
    certifications: [{
      name: String,
      documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      }
    }],
    signedNDA: {
      uploaded: Boolean,
      documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      }
    },
    signature: {
      uploaded: Boolean,
      documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      }
    }
  },
  
  // Declaration
  declaration: {
    accepted: Boolean,
    acceptedDate: Date
  },
  
  // Performance Metrics
  performanceMetrics: {
    totalCandidatesSubmitted: {
      type: Number,
      default: 0
    },
    totalSelected: {
      type: Number,
      default: 0
    },
    totalJoined: {
      type: Number,
      default: 0
    },
    avgResponseTime: Number, // hours
    qualityScore: Number, // out of 5
    lastActive: Date
  },
  
  // Allocation History
  allocationHistory: [{
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Requirement'
    },
    allocatedAt: Date,
    status: {
      type: String,
      enum: ['Active', 'Completed', 'Withdrawn']
    },
    candidatesSubmitted: Number,
    candidatesSelected: Number
  }],
  
  // Status
  status: {
    type: String,
    enum: ['Pending', 'Active', 'Inactive', 'Suspended', 'Blacklisted'],
    default: 'Pending'
  },
  verificationStatus: {
    type: String,
    enum: ['Pending', 'Verified', 'Rejected'],
    default: 'Pending'
  },
  
  // User Account Link
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  deletedAt: Date
}, {
  timestamps: true
});

// Indexes
freelanceRecruiterSchema.index({ 'personalDetails.email': 1 });
freelanceRecruiterSchema.index({ 'personalDetails.fullName': 'text' });
freelanceRecruiterSchema.index({ status: 1, verificationStatus: 1 });

// Virtual for freelancer code
freelanceRecruiterSchema.virtual('freelancerCode').get(function() {
  return `FR${this._id.toString().slice(-6).toUpperCase()}`;
});

// Method to calculate success rate
freelanceRecruiterSchema.methods.getSuccessRate = function() {
  if (this.performanceMetrics.totalCandidatesSubmitted === 0) return 0;
  return (this.performanceMetrics.totalJoined / this.performanceMetrics.totalCandidatesSubmitted * 100).toFixed(2);
};

module.exports = mongoose.model('FreelanceRecruiter', freelanceRecruiterSchema);