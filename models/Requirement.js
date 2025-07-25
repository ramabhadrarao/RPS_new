// models/Requirement.js
const mongoose = require('mongoose');

const requirementSchema = new mongoose.Schema({
  // Job Details
  jobTitle: {
    type: String,
    required: true,
    index: true
  },
  employmentType: {
    type: String,
    enum: ['fullTime', 'contract', 'temporary'],
    required: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true
  },
  backgroundCheck: String,
  
  // Skills
  keySkills: [{
    name: {
      type: String,
      required: true
    },
    experience: Number,
    isMandatory: {
      type: Boolean,
      default: true
    }
  }],
  
  departmentCategory: String,
  
  // Work Details
  workMode: {
    type: String,
    enum: ['hybrid', 'remote', 'office']
  },
  hybridNorm: String,
  shiftType: String,
  otherShift: String,
  dayRange: String,
  otherDayRange: String,
  jobLocation: {
    type: String,
    required: true
  },
  relocateCandidates: Boolean,
  
  // Experience & Salary
  workExpMin: Number,
  workExpMax: Number,
  salaryType: {
    type: String,
    enum: ['annual', 'monthly']
  },
  salaryMin: Number,
  salaryMax: Number,
  variableSalary: Number,
  hideSalaryDetails: Boolean,
  
  // Education & Diversity
  educationalQualification: String,
  diversity: [String],
  
  // Perks & Benefits
  perksBenefits: [String],
  otherPerksBenefits: String,
  
  // Job Description
  jobDescription: {
    type: String,
    required: true
  },
  
  // Interview Process
  numInterviewRounds: Number,
  interviewRounds: [{
    name: String,
    mode: String,
    type: String,
    interviewers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  }],
  
  // Vacancy Details
  moreVacancy: {
    type: String,
    enum: ['yes', 'no']
  },
  vacancyCount: {
    type: Number,
    default: 1
  },
  filledCount: {
    type: Number,
    default: 0
  },
  
  // Company Info
  companyName: String,
  companyWebsite: String,
  aboutCompany: String,
  companyAddress: String,
  
  // Additional Settings
  refreshJob: Boolean,
  refreshInterval: Number, // in days
  lastRefreshedAt: Date,
  
  // Allocation Details
  allocation: {
    all: {
      type: Boolean,
      default: false
    },
    recruiters: [{
      recruiterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      allocatedAt: {
        type: Date,
        default: Date.now
      }
    }],
    teams: [{
      teamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team'
      },
      allocatedAt: {
        type: Date,
        default: Date.now
      }
    }],
    freelancers: [{
      freelancerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FreelanceRecruiter'
      },
      allocatedAt: {
        type: Date,
        default: Date.now
      }
    }],
    vendors: [{
      vendorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agency'
      },
      allocatedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  
  // Status and Tracking
  status: {
    type: String,
    enum: ['Draft', 'Active', 'On Hold', 'Closed', 'Cancelled'],
    default: 'Draft'
  },
  publishedAt: Date,
  closedAt: Date,
  
  // Performance Metrics
  metrics: {
    totalApplications: {
      type: Number,
      default: 0
    },
    shortlisted: {
      type: Number,
      default: 0
    },
    interviewed: {
      type: Number,
      default: 0
    },
    selected: {
      type: Number,
      default: 0
    },
    joined: {
      type: Number,
      default: 0
    }
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
requirementSchema.index({ jobTitle: 'text', jobDescription: 'text' });
requirementSchema.index({ clientId: 1, status: 1 });
requirementSchema.index({ 'keySkills.name': 1 });
requirementSchema.index({ jobLocation: 1 });
requirementSchema.index({ createdAt: -1 });

// Virtual for requirement code
requirementSchema.virtual('requirementCode').get(function() {
  const date = new Date(this.createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const seq = this._id.toString().slice(-3).toUpperCase();
  return `REQ-${year}-${month}-${day}-${seq}`;
});

// Method to check if requirement is fulfilled
requirementSchema.methods.isFulfilled = function() {
  return this.filledCount >= this.vacancyCount;
};

// Method to check if user has access
requirementSchema.methods.hasAccess = function(userId) {
  if (this.allocation.all) return true;
  
  const userIdStr = userId.toString();
  
  return (
    this.allocation.recruiters.some(r => r.recruiterId.toString() === userIdStr) ||
    this.allocation.freelancers.some(f => f.freelancerId.toString() === userIdStr) ||
    this.allocation.vendors.some(v => v.vendorId.toString() === userIdStr)
    // Note: For teams, you'd need to check team membership separately
  );
};

module.exports = mongoose.model('Requirement', requirementSchema);