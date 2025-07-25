// scripts/setup.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config();

async function setupDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Create indexes
    console.log('Creating indexes...');
    await createIndexes();
    
    // Create super admin
    console.log('Creating super admin user...');
    await createSuperAdmin();
    
    // Create sample data
    if (process.env.NODE_ENV === 'development') {
      console.log('Creating sample data...');
      await createSampleData();
    }
    
    console.log('Setup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}

async function createIndexes() {
  // User indexes
  await User.collection.createIndex({ email: 1 }, { unique: true });
  await User.collection.createIndex({ role: 1 });
  
  // Add other model indexes here
  console.log('Indexes created');
}

async function createSuperAdmin() {
  const existingAdmin = await User.findOne({ role: 'super_admin' });
  
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('Admin@123', 12);
    
    await User.create({
      email: 'admin@ats.com',
      password: hashedPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'super_admin',
      isEmailVerified: true,
      isActive: true
    });
    
    console.log('Super admin created:');
    console.log('Email: admin@ats.com');
    console.log('Password: Admin@123');
  } else {
    console.log('Super admin already exists');
  }
}

async function createSampleData() {
  // Create sample HR user
  const hrUser = await User.findOne({ email: 'hr@ats.com' });
  
  if (!hrUser) {
    const hashedPassword = await bcrypt.hash('Hr@123', 12);
    
    await User.create({
      email: 'hr@ats.com',
      password: hashedPassword,
      firstName: 'HR',
      lastName: 'Manager',
      role: 'hr',
      isEmailVerified: true,
      isActive: true
    });
    
    console.log('Sample HR user created');
  }
  
  // Create sample recruiter
  const recruiterUser = await User.findOne({ email: 'recruiter@ats.com' });
  
  if (!recruiterUser) {
    const hashedPassword = await bcrypt.hash('Recruiter@123', 12);
    
    await User.create({
      email: 'recruiter@ats.com',
      password: hashedPassword,
      firstName: 'John',
      lastName: 'Recruiter',
      role: 'recruiter',
      isEmailVerified: true,
      isActive: true
    });
    
    console.log('Sample recruiter created');
  }
}

// Run setup
setupDatabase();

// scripts/seed.js
const mongoose = require('mongoose');
const Client = require('../models/Client');
const Requirement = require('../models/Requirement');
const BGVVendor = require('../models/BGVVendor');
require('dotenv').config();

async function seedDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Get admin user
    const User = require('../models/User');
    const adminUser = await User.findOne({ role: 'super_admin' });
    
    if (!adminUser) {
      console.error('Please run setup script first to create admin user');
      process.exit(1);
    }
    
    // Create sample client
    const existingClient = await Client.findOne({ 'businessDetails.clientName': 'TCS' });
    
    let client;
    if (!existingClient) {
      client = await Client.create({
        businessType: 'Contract',
        subType: 'Contract',
        businessDetails: {
          clientName: 'TCS',
          industry: 'IT',
          website: 'https://www.tcs.com',
          aboutUs: 'Tata Consultancy Services is an IT services, consulting and business solutions organization.',
          numberOfEmployees: 500000
        },
        addressDetails: {
          primaryAddress: '123 IT Park, Mumbai, Maharashtra, India',
          billingAddress: '456 Finance Tower, Mumbai, Maharashtra, India'
        },
        billingInfo: {
          gstNumber: '27AAACT2727Q1Z0',
          paymentTerms: 30,
          billingRule: 'Per day'
        },
        timesheetConfig: {
          timesheetType: 'Day',
          fillingType: 'Portal',
          portalName: 'TCS Timesheet Portal',
          cutoffDate: new Date('2024-01-25')
        },
        spocDetails: [{
          name: 'Rajesh Kumar',
          email: 'rajesh.kumar@tcs.com',
          mobile: '9876543210',
          location: 'Mumbai',
          designation: 'HR Manager',
          status: 'Active',
          functionalRoles: ['HR', 'Management'],
          accountsHandled: ['Project A', 'Project B']
        }],
        createdBy: adminUser._id
      });
      
      console.log('Sample client created');
    } else {
      client = existingClient;
      console.log('Client already exists');
    }
    
    // Create sample requirement
    const existingReq = await Requirement.findOne({ jobTitle: 'Senior Java Developer' });
    
    if (!existingReq) {
      await Requirement.create({
        jobTitle: 'Senior Java Developer',
        employmentType: 'fullTime',
        clientId: client._id,
        keySkills: [
          { name: 'Java', experience: 5, isMandatory: true },
          { name: 'Spring Boot', experience: 3, isMandatory: true },
          { name: 'Microservices', experience: 2, isMandatory: false }
        ],
        departmentCategory: 'IT - Software Development',
        workMode: 'hybrid',
        hybridNorm: '3 days office, 2 days remote',
        shiftType: 'Day shift',
        dayRange: 'Monday to Friday',
        jobLocation: 'Mumbai',
        workExpMin: 5,
        workExpMax: 8,
        salaryType: 'annual',
        salaryMin: 1200000,
        salaryMax: 1800000,
        educationalQualification: 'B.Tech/B.E in Computer Science or equivalent',
        diversity: ['All'],
        perksBenefits: ['Health Insurance', 'Provident Fund', 'Flexible Schedule'],
        jobDescription: 'We are looking for a Senior Java Developer to join our team...',
        numInterviewRounds: 3,
        interviewRounds: [
          { name: 'Technical Round 1', mode: 'Video Interview (Online)', type: 'Technical Interview' },
          { name: 'Technical Round 2', mode: 'Video Interview (Online)', type: 'Technical Interview' },
          { name: 'HR Round', mode: 'Video Interview (Online)', type: 'HR Interview' }
        ],
        vacancyCount: 5,
        companyName: client.businessDetails.clientName,
        aboutCompany: client.businessDetails.aboutUs,
        status: 'Active',
        publishedAt: new Date(),
        createdBy: adminUser._id
      });
      
      console.log('Sample requirement created');
    }
    
    // Create sample BGV vendor
    const existingVendor = await BGVVendor.findOne({ vendorName: 'SecureCheck Services' });
    
    if (!existingVendor) {
      await BGVVendor.create({
        vendorName: 'SecureCheck Services',
        website: 'https://www.securecheck.com',
        clientId: client._id,
        address: '789 Security Plaza, Mumbai, Maharashtra',
        billingAddress: '789 Security Plaza, Mumbai, Maharashtra',
        gstNumber: '27AABCS1234D1Z0',
        invoicePaymentTerms: 15,
        spocDetails: [{
          name: 'Priya Sharma',
          email: 'priya@securecheck.com',
          phone: '9876543211',
          designation: 'Operations Manager',
          location: 'Mumbai',
          status: 'Active',
          functionalRoles: ['Operations', 'Technical'],
          accountsHandled: ['TCS Account']
        }],
        servicesOffered: {
          educationVerification: true,
          employmentVerification: true,
          addressVerification: true,
          criminalCheck: true,
          referenceCheck: true
        },
        slaDetails: {
          standardTAT: 7,
          expressTAT: 3
        },
        status: 'Active',
        createdBy: adminUser._id
      });
      
      console.log('Sample BGV vendor created');
    }
    
    console.log('Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

// Run seeding
seedDatabase();