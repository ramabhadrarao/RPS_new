// models/Candidate.js
const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
  // Personal Details
  personalDetails: {
    firstName: {
      type: String,
      required: true,
      index: true
    },
    middleName: String,
    lastName: {
      type: String,
      required: true,
      index: true
    },
    dateOfBirth: {
      type: Date,
      required: true
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other']
    },
    maritalStatus: {
      type: String,
      enum: ['Single', 'Married']
    },
    passportImageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileDocument'
    }
  },
  
  // Contact Information
  contactInfo: {
    phoneNo: {
      type: String,
      required: true,
      index: true
    },
    whatsappNo: String,
    alternatePhone: String,
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true
    }
  },
  
  // Emergency Contact
  emergencyContact: {
    contactPerson: String,
    contactPhone: String,
    relationship: String
  },
  
  // Education Details (Array)
  education: [{
    educationType: String,
    schoolCollegeName: String,
    modeOfEducation: String,
    specialization: String,
    startDate: Date,
    endDate: Date,
    marksGrade: String,
    university: String,
    city: String,
    state: String,
    certificateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileDocument'
    }
  }],
  
  // Employment Details (Array)
  employment: [{
    employmentType: String,
    workingStatus: String,
    designation: String,
    workLocation: String,
    payrollCompany: String,
    clientCompany: String,
    endClient: String,
    startDate: Date,
    estimatedLastWorkingDate: Date,
    lastWorkingDate: Date,
    expectedJoiningDate: Date,
    noticePeriod: String,
    documents: {
      resignationLetter: {
        available: Boolean,
        fileId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'FileDocument'
        },
        remarks: String
      },
      pfDocument: {
        available: Boolean,
        fileId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'FileDocument'
        },
        remarks: String
      },
      payslips: {
        available: Boolean,
        fileId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'FileDocument'
        },
        remarks: String
      },
      // ... other documents
    }
  }],
  
  // Offer Status
  offerStatus: {
    inAnotherPipeline: Boolean,
    pipelineDetails: String,
    offerInHand: Boolean,
    offerDetails: String,
    offerProofId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileDocument'
    }
  },
  
  // KYC Details
  kyc: {
    aadhaarNumber: {
      type: String,
      select: false // Security - only available when explicitly requested
    },
    aadhaarFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileDocument'
    },
    panNumber: {
      type: String,
      select: false
    },
    panFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileDocument'
    },
    panSelfieId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileDocument'
    },
    passportNumber: {
      type: String,
      select: false
    },
    passportFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileDocument'
    }
  },
  
  // Bank Details
  bankDetails: {
    accountChoice: String,
    accountNumber: {
      type: String,
      select: false
    },
    ifscCode: String,
    branchName: String,
    chequeFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileDocument'
    }
  },
  
  // Address
  address: {
    permanent: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String
    },
    current: {
      sameAsPermanent: Boolean,
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      rentalAgreementId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      },
      utilityBillId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FileDocument'
      }
    }
  },
  
  // Financial Information
  financialInfo: {
    businessType: String,
    lastWithdrawnSalary: Number,
    offeredSalary: Number,
    billRate: Number,
    mspFeePercentage: Number,
    calculated: {
      hikePercentage: Number,
      grossMarginAmount: Number,
      grossMarginPercentage: Number,
      grossMarginAmountAfterMSP: Number,
      grossMarginPercentageAfterMSP: Number,
      leaveCost: Number,
      afterLeaveCostMarginAmount: Number,
      afterLeaveCostMarginPercentage: Number
    }
  },
  
  // Recruiter Call Information
  recruiterCallData: {
    lookingForJob: String,
    notInterestedReason: String,
    educationLevels: [String],
    regularEducation: String,
    educationRemark: String,
    highestQualification: String,
    completionDate: Date,
    totalExperience: String,
    relevantExperience: String,
    currentCity: String,
    jobLocation: String,
    jobLocationOk: String,
    relocationDetails: {
      willingToRelocate: String,
      reason: String,
      familyRelocate: String,
      relocateAlone: String,
      plan: String,
      supportNeeded: String
    },
    salaryDetails: {
      currentCTC: Number,
      takeHome: Number,
      expectedCTC: Number,
      variableSalary: Number
    },
    workStatus: {
      status: String,
      currentCompany: String,
      payrollCompany: String,
      noticePeriod: String,
      resignationReason: String,
      hasResignationProof: String,
      offersInHand: String,
      interviewsInPipeline: String,
      jobInterestReason: String
    }
  },
  
  // Status and Workflow
  status: {
    type: String,
    enum: ['New', 'Screening', 'Submitted', 'Interview', 'Selected', 'Offered', 'Joined', 'Rejected', 'On Hold'],
    default: 'New'
  },
  workflowStage: {
    type: String,
    enum: ['Personal Details', 'Education', 'Employment', 'KYC', 'Financial', 'Review', 'Complete'],
    default: 'Personal Details'
  },
  
  // Tracking
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Additional Fields
  tags: [String],
  notes: [{
    text: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  isActive: {
    type: Boolean,
    default: true
  },
  deletedAt: Date
}, {
  timestamps: true
});

// Indexes
candidateSchema.index({ 'personalDetails.firstName': 'text', 'personalDetails.lastName': 'text' });
candidateSchema.index({ 'contactInfo.email': 1, 'contactInfo.phoneNo': 1 });
candidateSchema.index({ status: 1, workflowStage: 1 });
candidateSchema.index({ createdAt: -1 });

// Virtual for full name
candidateSchema.virtual('fullName').get(function() {
  return `${this.personalDetails.firstName} ${this.personalDetails.middleName || ''} ${this.personalDetails.lastName}`.trim();
});

// Virtual for candidate code
candidateSchema.virtual('candidateCode').get(function() {
  return `CAN${this._id.toString().slice(-6).toUpperCase()}`;
});

// Method to check if candidate can move to next stage
candidateSchema.methods.canMoveToNextStage = function() {
  const stageRequirements = {
    'Personal Details': ['personalDetails', 'contactInfo', 'emergencyContact'],
    'Education': ['education'],
    'Employment': ['employment'],
    'KYC': ['kyc', 'bankDetails', 'address'],
    'Financial': ['financialInfo']
  };
  
  const currentRequirements = stageRequirements[this.workflowStage] || [];
  
  for (const req of currentRequirements) {
    if (!this[req] || (Array.isArray(this[req]) && this[req].length === 0)) {
      return false;
    }
  }
  
  return true;
};

module.exports = mongoose.model('Candidate', candidateSchema);