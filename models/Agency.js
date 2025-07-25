// models/Agency.js
const mongoose = require('mongoose');

const agencySchema = new mongoose.Schema({
  // Section 1: Company Details
  companyDetails: {
    companyName: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    registeredBusinessName: String,
    businessType: {
      type: String,
      enum: ['Proprietorship', 'Partnership', 'Pvt Ltd', 'LLP', 'Other']
    },
    yearOfEstablishment: Number,
    gstNumber: {
      type: String,
      unique: true,
      sparse: true
    },
    panNumber: {
      type: String,
      unique: true,
      sparse: true
    },
    registeredAddress: String,
    officeAddress: String,
    website: String,
    msmeNumber: String
  },
  
  // Section 2: Contact Details
  contactDetails: {
    primaryContact: {
      name: String,
      designation: String,
      email: {
        type: String,
        required: true,
        lowercase: true
      },
      mobile: {
        type: String,
        required: true
      }
    },
    alternateContact: {
      name: String,
      mobile: String
    },
    linkedIn: String
  },
  
  // Section 3: Recruitment Capability
  recruitmentCapability: {
    keySkills: [String],
    industries: [String],
    interestedIn: {
      type: String,
      enum: ['Permanent', 'Contract', 'Both']
    },
    geographicalCoverage: [String],
    candidateTypes: [String], // Fresher, Lateral, Executive
    monthlyCapacity: Number,
    turnaroundTime: String
  },
  
  // Section 4: Current Client Engagements
  currentEngagements: [{
    clientName: String,
    engagementType: String,
    teamSizeSupported: Number,
    referenceContact: String
  }],
  
  // Section 5: Past Performance
  pastPerformance: {
    avgMonthlyClosures: Number,
    repeatBusinessPercentage: Number,
    clientSatisfactionScore: Number
  },
  
  // Section 6: Team Information
  teamInfo: {
    numberOfRecruiters: Number,
    experienceRange: String,
    recruiterLevels: String,
    recruitmentTools: [String],
    atsCrm: String,
    techStackSpecialization: [String]
  },
  
  // Section 7: Commercials
  commercials: {
    permanentHiringFeePercentage: Number,
    replacementPeriodDays: Number,
    contractBillingRate: String,
    paymentTerms: String,
    invoiceRaisedAfter: {
      type: String,
      enum: ['Joining', '15 Days', '30 Days']
    },
    penaltyBonusClauses: String
  },
  
  // Section 8: Compliance
  compliance: {
    panCard: {
      available: Boolean,
      documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      }
    },
    gstCertificate: {
      available: Boolean,
      documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      }
    },
    cancelledCheque: {
      available: Boolean,
      documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      }
    },
    companyRegistration: {
      available: Boolean,
      documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      }
    },
    signedNDA: {
      available: Boolean,
      documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      }
    },
    bankDetailsLetter: {
      available: Boolean,
      documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      }
    },
    pendingLegalCases: Boolean
  },
  
  // Section 9: Bank Details
  bankDetails: {
    bankName: String,
    accountHolderName: String,
    accountNumber: {
      type: String,
      select: false
    },
    ifscCode: String,
    branchAddress: String
  },
  
  // Section 10: Declaration
  declaration: {
    authorized: Boolean,
    signatoryName: String,
    signatoryDesignation: String,
    declarationDate: Date,
    digitalSignatureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileDocument'
    }
  },
  
  // Performance Tracking
  performanceMetrics: {
    totalCandidatesSubmitted: {
      type: Number,
      default: 0
    },
    totalCandidatesSelected: {
      type: Number,
      default: 0
    },
    totalCandidatesJoined: {
      type: Number,
      default: 0
    },
    avgTimeToFill: Number,
    qualityScore: Number,
    lastEvaluated: Date
  },
  
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
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
agencySchema.index({ 'companyDetails.companyName': 'text' });
agencySchema.index({ status: 1, verificationStatus: 1 });

// Virtual for agency code
agencySchema.virtual('agencyCode').get(function() {
  return `AG${this._id.toString().slice(-6).toUpperCase()}`;
});

// Method to check onboarding completion
agencySchema.methods.isOnboardingComplete = function() {
  return (
    this.companyDetails.companyName &&
    this.contactDetails.primaryContact.email &&
    this.recruitmentCapability.keySkills.length > 0 &&
    this.commercials.permanentHiringFeePercentage &&
    this.compliance.signedNDA?.available &&
    this.declaration.authorized
  );
};

module.exports = mongoose.model('Agency', agencySchema);