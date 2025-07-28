// scripts/setup.js
const mongoose = require('mongoose');
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
    // Create user with plain password - let the model handle hashing
    await User.create({
      email: 'admin@ats.com',
      password: 'Admin@123',  // Plain password - will be hashed by pre-save hook
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
    // Plain password - will be hashed by pre-save hook
    await User.create({
      email: 'hr@ats.com',
      password: 'Hr@123',  // Plain password
      firstName: 'HR',
      lastName: 'Manager',
      role: 'hr',
      isEmailVerified: true,
      isActive: true
    });
    
    console.log('Sample HR user created:');
    console.log('Email: hr@ats.com');
    console.log('Password: Hr@123');
  }
  
  // Create sample recruiter
  const recruiterUser = await User.findOne({ email: 'recruiter@ats.com' });
  
  if (!recruiterUser) {
    // Plain password - will be hashed by pre-save hook
    await User.create({
      email: 'recruiter@ats.com',
      password: 'Recruiter@123',  // Plain password
      firstName: 'John',
      lastName: 'Recruiter',
      role: 'recruiter',
      isEmailVerified: true,
      isActive: true
    });
    
    console.log('Sample recruiter created:');
    console.log('Email: recruiter@ats.com');
    console.log('Password: Recruiter@123');
  }
}

// Run setup
setupDatabase();