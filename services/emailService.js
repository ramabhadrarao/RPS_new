// services/emailService.js
const nodemailer = require('nodemailer');
const pug = require('pug');
const htmlToText = require('html-to-text');
const Queue = require('bull');
const path = require('path');
const config = require('../config/constants');

class EmailService {
  constructor() {
    // Initialize email queue
    this.emailQueue = new Queue('email', config.redis.url);
    
    // Initialize transporter based on environment
    this.initializeTransporter();
    
    // Process email queue
    this.processQueue();
  }
  
  initializeTransporter() {
    // Gmail configuration
    if (process.env.EMAIL_SERVICE === 'gmail') {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD
        }
      });
    } 
    // Development configuration (Mailhog)
    else if (process.env.NODE_ENV === 'development' && !process.env.EMAIL_SERVICE) {
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'localhost',
        port: process.env.EMAIL_PORT || 1025,
        secure: false, // true for 465, false for other ports
        auth: process.env.EMAIL_USERNAME ? {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD
        } : undefined
      });
    }
    // Production configuration (SendGrid)
    else if (process.env.NODE_ENV === 'production') {
      this.transporter = nodemailer.createTransport({
        service: 'SendGrid',
        auth: {
          user: process.env.SENDGRID_USERNAME,
          pass: process.env.SENDGRID_PASSWORD
        }
      });
    }
    
    // Verify connection configuration
    this.transporter.verify(function(error, success) {
      if (error) {
        console.error('Email service connection error:', error);
      } else {
        console.log('Email service is ready to send messages');
      }
    });
  }
  
  // Process email queue
  processQueue() {
    this.emailQueue.process(async (job) => {
      const { to, subject, template, data } = job.data;
      try {
        await this.send(to, subject, template, data);
        return { success: true };
      } catch (error) {
        console.error('Failed to send email:', error);
        throw error;
      }
    });
    
    // Handle completed jobs
    this.emailQueue.on('completed', (job) => {
      console.log(`Email job ${job.id} completed successfully`);
    });
    
    // Handle failed jobs
    this.emailQueue.on('failed', (job, err) => {
      console.error(`Email job ${job.id} failed:`, err);
    });
  }
  
  // Queue email
  async queueEmail(to, subject, template, data) {
    try {
      const job = await this.emailQueue.add(
        { to, subject, template, data },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      );
      console.log(`Email queued with job ID: ${job.id}`);
      return job;
    } catch (error) {
      console.error('Failed to queue email:', error);
      // If queueing fails, try to send directly
      return this.send(to, subject, template, data);
    }
  }
  
  // Send email directly
  async send(to, subject, template, data) {
    try {
      // Check if template file exists
      const templatePath = path.join(__dirname, '..', 'views', 'emails', `${template}.pug`);
      
      let html;
      try {
        // Generate HTML from pug template
        html = pug.renderFile(templatePath, {
          ...data,
          subject,
          appName: config.app.name,
          appUrl: config.app.url,
          year: new Date().getFullYear(),
          cache: true,
          filename: templatePath
        });
      } catch (pugError) {
        console.error('Pug template error:', pugError);
        // Fallback to simple HTML if template fails
        html = this.getFallbackTemplate(template, data);
      }
      
      // Generate text version
      const text = htmlToText.convert(html, {
        wordwrap: 130,
        selectors: [
          { selector: 'a', options: { baseUrl: config.app.url } },
          { selector: 'img', format: 'skip' }
        ]
      });
      
      // Determine from email
      const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || 'noreply@ats.local';
      const fromName = process.env.EMAIL_FROM_NAME || config.app.name;
      
      // Mail options
      const mailOptions = {
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject,
        html,
        text
      };
      
      // Send email
      const info = await this.transporter.sendMail(mailOptions);
      
      console.log(`Email sent successfully to ${to}. Message ID: ${info.messageId}`);
      return info;
    } catch (error) {
      console.error('Email send error:', error);
      throw error;
    }
  }
  
  // Fallback templates when pug fails
  getFallbackTemplate(template, data) {
    const templates = {
      welcome: `
        <h2>Welcome to ${config.app.name}!</h2>
        <p>Hi ${data.firstName},</p>
        <p>Thank you for registering with us. Your account has been created successfully.</p>
        <p>To get started, please verify your email address by clicking the link below:</p>
        <p><a href="${data.verificationUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a></p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p>${data.verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <p>Best regards,<br>The ${config.app.name} Team</p>
      `,
      passwordReset: `
        <h2>Password Reset Request</h2>
        <p>Hi ${data.firstName},</p>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        <p><a href="${data.resetUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a></p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p>${data.resetUrl}</p>
        <p>This link will expire in ${data.validMinutes || 30} minutes.</p>
        <p>If you didn't request this password reset, please ignore this email.</p>
        <p>Best regards,<br>The ${config.app.name} Team</p>
      `,
      default: `
        <h2>${data.subject || 'Notification'}</h2>
        <p>${data.message || 'You have a new notification from ' + config.app.name}</p>
        <p>Best regards,<br>The ${config.app.name} Team</p>
      `
    };
    
    return templates[template] || templates.default;
  }
  
  // Email template methods
  async sendWelcome(user) {
    const verificationToken = user.emailVerificationToken || 'test-token';
    return this.queueEmail(
      user.email,
      'Welcome to ATS Platform',
      'welcome',
      {
        firstName: user.firstName,
        verificationUrl: `${config.app.url}/verify-email/${verificationToken}`
      }
    );
  }
  
  async sendPasswordReset(user, resetUrl) {
    return this.queueEmail(
      user.email,
      'Password Reset Request',
      'passwordReset',
      {
        firstName: user.firstName,
        resetUrl,
        validMinutes: 30
      }
    );
  }
  
  async sendCandidateStatusUpdate(candidate) {
    return this.queueEmail(
      candidate.contactInfo.email,
      `Application Status Update - ${candidate.status}`,
      'candidateStatusUpdate',
      {
        candidateName: candidate.fullName || `${candidate.personalDetails.firstName} ${candidate.personalDetails.lastName}`,
        status: candidate.status,
        jobTitle: candidate.appliedPosition || 'Position',
        trackingUrl: `${config.app.url}/candidate/track/${candidate._id}`
      }
    );
  }
  
  async sendCandidateReviewNotification(candidate) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@ats.local';
    return this.queueEmail(
      adminEmail,
      'Candidate Ready for Review',
      'candidateReview',
      {
        candidateName: candidate.fullName || `${candidate.personalDetails.firstName} ${candidate.personalDetails.lastName}`,
        candidateId: candidate._id,
        reviewUrl: `${config.app.url}/candidates/${candidate._id}/review`
      }
    );
  }
  
  async sendCandidateAssignment(candidate, assignToId) {
    const User = require('../models/User');
    const assignedUser = await User.findById(assignToId);
    
    if (!assignedUser) {
      console.error('Assigned user not found');
      return;
    }
    
    return this.queueEmail(
      assignedUser.email,
      'New Candidate Assigned',
      'candidateAssignment',
      {
        userName: assignedUser.firstName,
        candidateName: candidate.fullName || `${candidate.personalDetails.firstName} ${candidate.personalDetails.lastName}`,
        candidateUrl: `${config.app.url}/candidates/${candidate._id}`
      }
    );
  }
  
  async sendInterviewInvitation(candidate, interview) {
    return this.queueEmail(
      candidate.contactInfo.email,
      'Interview Invitation',
      'interviewInvitation',
      {
        candidateName: candidate.fullName || `${candidate.personalDetails.firstName} ${candidate.personalDetails.lastName}`,
        interviewDate: new Date(interview.scheduledDate).toLocaleDateString(),
        interviewTime: interview.scheduledTime,
        interviewMode: interview.mode,
        jobTitle: interview.jobTitle,
        companyName: interview.companyName,
        joinLink: interview.joinLink,
        instructions: interview.instructions
      }
    );
  }
  
  async sendOfferLetter(candidate, offer) {
    return this.queueEmail(
      candidate.contactInfo.email,
      'Job Offer - Congratulations!',
      'offerLetter',
      {
        candidateName: candidate.fullName || `${candidate.personalDetails.firstName} ${candidate.personalDetails.lastName}`,
        position: offer.position,
        companyName: offer.companyName,
        salary: offer.salary,
        joiningDate: new Date(offer.joiningDate).toLocaleDateString(),
        offerValidTill: new Date(offer.validTill).toLocaleDateString(),
        acceptUrl: `${config.app.url}/offer/accept/${offer.token}`,
        declineUrl: `${config.app.url}/offer/decline/${offer.token}`
      }
    );
  }
  
  async sendRequirementAllocation(user, requirement) {
    return this.queueEmail(
      user.email,
      'New Requirement Assigned',
      'requirementAllocation',
      {
        userName: user.firstName,
        jobTitle: requirement.jobTitle,
        clientName: requirement.clientId?.businessDetails?.clientName || 'Client',
        urgency: requirement.urgency || 'Normal',
        positions: requirement.vacancyCount,
        viewUrl: `${config.app.url}/requirements/${requirement._id}`
      }
    );
  }
  
  async sendDocumentVerificationRequest(candidate, documents) {
    return this.queueEmail(
      candidate.contactInfo.email,
      'Document Verification Required',
      'documentVerification',
      {
        candidateName: candidate.fullName || `${candidate.personalDetails.firstName} ${candidate.personalDetails.lastName}`,
        documents: documents.map(d => d.name),
        uploadUrl: `${config.app.url}/candidate/documents/${candidate._id}`
      }
    );
  }
  
  async sendBulkEmail(recipients, subject, template, commonData) {
    const jobs = recipients.map(recipient => ({
      to: recipient.email,
      subject,
      template,
      data: { ...commonData, ...recipient.data }
    }));
    
    const bulkJobs = await this.emailQueue.addBulk(
      jobs.map(job => ({ 
        data: job,
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      }))
    );
    
    console.log(`Bulk email queued: ${bulkJobs.length} emails`);
    return bulkJobs;
  }
  
  async sendDailyDigest(user, data) {
    return this.queueEmail(
      user.email,
      'Your Daily ATS Summary',
      'dailyDigest',
      {
        userName: user.firstName,
        newCandidates: data.newCandidates || [],
        interviewsToday: data.interviewsToday || [],
        pendingActions: data.pendingActions || [],
        requirementUpdates: data.requirementUpdates || []
      }
    );
  }
  
  // Test email functionality
  async sendTestEmail(to) {
    return this.send(
      to,
      'ATS Platform - Test Email',
      'test',
      {
        message: 'This is a test email from ATS Platform. If you received this, your email configuration is working correctly!',
        timestamp: new Date().toISOString()
      }
    );
  }
}

module.exports = new EmailService();