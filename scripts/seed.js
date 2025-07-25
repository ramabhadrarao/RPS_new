// scripts/seed.js
const mongoose = require('mongoose');
const Client = require('../models/Client');
const Requirement = require('../models/Requirement');
const BGVVendor = require('../models/BGVVendor');
const User = require('../models/User');
require('dotenv').config();

async function seedDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Get admin user
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
          workingHoursPerDay: 8,
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
          { 
            name: 'Technical Round 1', 
            mode: 'Video Interview (Online)', 
            type: 'Technical Interview',
            interviewers: []
          },
          { 
            name: 'Technical Round 2', 
            mode: 'Video Interview (Online)', 
            type: 'Technical Interview',
            interviewers: []
          },
          { 
            name: 'HR Round', 
            mode: 'Video Interview (Online)', 
            type: 'HR Interview',
            interviewers: []
          }
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