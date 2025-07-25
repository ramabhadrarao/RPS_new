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