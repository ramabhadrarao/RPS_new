// services/emailService.js
const nodemailer = require('nodemailer');
const pug = require('pug');
const htmlToText = require('html-to-text');
const path = require('path');
const config = require('../config/constants');

class EmailService {
  constructor() {
    // Initialize transporter based on environment
    this.initializeTransporter();
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
        secure: false,
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
  
  // Main send method - sends email directly
  async send(to, subject, template, data) {
    try {
      console.log(`📨 Sending email directly...`);
      console.log(`   To: ${to}`);
      console.log(`   Subject: ${subject}`);
      
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
        console.error('Pug template error, using fallback:', pugError.message);
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
      
      console.log(`   From: ${mailOptions.from}`);
      console.log(`   Sending...`);
      
      // Send email
      const info = await this.transporter.sendMail(mailOptions);
      
      console.log(`✅ Email sent successfully!`);
      console.log(`   Message ID: ${info.messageId}`);
      console.log(`   Response: ${info.response}`);
      
      return info;
    } catch (error) {
      console.error('❌ Email send error:', error.message);
      console.error('   Full error:', error);
      throw error;
    }
  }
  
  // Fallback templates when pug fails
  getFallbackTemplate(template, data) {
    const templates = {
      welcome: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2563eb; color: white; padding: 20px; text-align: center;">
            <h1>${config.app.name}</h1>
          </div>
          <div style="padding: 30px; background-color: #f8f9fa;">
            <h2>Welcome to ${config.app.name}!</h2>
            <p>Hi ${data.firstName},</p>
            <p>Thank you for registering with us. Your account has been created successfully.</p>
            <p>To get started, please verify your email address by clicking the link below:</p>
            <p style="text-align: center;">
              <a href="${data.verificationUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
            </p>
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all;">${data.verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
            <p>Best regards,<br>The ${config.app.name} Team</p>
          </div>
        </div>
      `,
      passwordReset: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2563eb; color: white; padding: 20px; text-align: center;">
            <h1>${config.app.name}</h1>
          </div>
          <div style="padding: 30px; background-color: #f8f9fa;">
            <h2>Password Reset Request</h2>
            <p>Hi ${data.firstName},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <p style="text-align: center;">
              <a href="${data.resetUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
            </p>
            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all;">${data.resetUrl}</p>
            <p>This link will expire in ${data.validMinutes || 30} minutes.</p>
            <p>If you didn't request this password reset, please ignore this email.</p>
            <p>Best regards,<br>The ${config.app.name} Team</p>
          </div>
        </div>
      `,
      candidateStatusUpdate: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2563eb; color: white; padding: 20px; text-align: center;">
            <h1>${config.app.name}</h1>
          </div>
          <div style="padding: 30px; background-color: #f8f9fa;">
            <h2>Application Status Update</h2>
            <p>Dear ${data.candidateName},</p>
            <p>Your application status has been updated to: <strong>${data.status}</strong></p>
            ${data.status === 'Interview' ? '<p>Congratulations! You have been shortlisted for an interview.</p>' : ''}
            ${data.status === 'Selected' ? '<p>Congratulations! You have been selected for the position.</p>' : ''}
            <p>Track your application status anytime:</p>
            <p style="text-align: center;">
              <a href="${data.trackingUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Track Application</a>
            </p>
            <p>Best regards,<br>The ${config.app.name} Team</p>
          </div>
        </div>
      `,
      interviewInvitation: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2563eb; color: white; padding: 20px; text-align: center;">
            <h1>${config.app.name}</h1>
          </div>
          <div style="padding: 30px; background-color: #f8f9fa;">
            <h2>Interview Invitation</h2>
            <p>Dear ${data.candidateName},</p>
            <p>We are pleased to invite you for an interview for the position of <strong>${data.jobTitle}</strong> at <strong>${data.companyName}</strong>.</p>
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Date:</strong> ${data.interviewDate}</p>
              <p><strong>Time:</strong> ${data.interviewTime}</p>
              <p><strong>Mode:</strong> ${data.interviewMode}</p>
              ${data.joinLink ? `<p><strong>Join Link:</strong> <a href="${data.joinLink}">${data.joinLink}</a></p>` : ''}
            </div>
            ${data.instructions ? `<p><strong>Instructions:</strong><br>${data.instructions}</p>` : ''}
            <p>Please confirm your availability by replying to this email.</p>
            <p>Best regards,<br>The ${config.app.name} Team</p>
          </div>
        </div>
      `,
      test: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2563eb; color: white; padding: 20px; text-align: center;">
            <h1>${config.app.name}</h1>
          </div>
          <div style="padding: 30px; background-color: #f8f9fa;">
            <h2>Test Email</h2>
            <p>${data.message || 'This is a test email from ATS Platform.'}</p>
            ${data.timestamp ? `<p>Sent at: ${data.timestamp}</p>` : ''}
            <p>If you received this email, your email configuration is working correctly!</p>
          </div>
        </div>
      `,
      default: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #2563eb; color: white; padding: 20px; text-align: center;">
            <h1>${config.app.name}</h1>
          </div>
          <div style="padding: 30px; background-color: #f8f9fa;">
            <h2>${data.subject || 'Notification'}</h2>
            <p>${data.message || 'You have a new notification from ' + config.app.name}</p>
            <p>Best regards,<br>The ${config.app.name} Team</p>
          </div>
        </div>
      `
    };
    
    return templates[template] || templates.default;
  }
  
  // Email template methods
  async sendWelcome(user) {
    console.log('🎉 Sending welcome email...');
    const verificationToken = user.emailVerificationToken || 'test-token';
    const verificationUrl = `${config.app.url}/api/v1/auth/verify-email-form/${verificationToken}`;
    
    return this.send(
      user.email,
      'Welcome to ATS Platform - Please Verify Your Email',
      'welcome',
      {
        firstName: user.firstName,
        verificationUrl
      }
    );
  }
  
  async sendPasswordReset(user, resetUrl) {
    console.log('🔐 Sending password reset email...');
    return this.send(
      user.email,
      'Password Reset Request - ATS Platform',
      'passwordReset',
      {
        firstName: user.firstName,
        resetUrl,
        validMinutes: 30
      }
    );
  }
  
  async sendCandidateStatusUpdate(candidate) {
    return this.send(
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
    return this.send(
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
    
    return this.send(
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
    return this.send(
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
    return this.send(
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
    return this.send(
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
    return this.send(
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
    const results = [];
    
    // Send emails one by one
    for (const recipient of recipients) {
      try {
        const result = await this.send(
          recipient.email,
          subject,
          template,
          { ...commonData, ...recipient.data }
        );
        results.push({ email: recipient.email, success: true, result });
      } catch (error) {
        console.error(`Failed to send to ${recipient.email}:`, error.message);
        results.push({ email: recipient.email, success: false, error: error.message });
      }
    }
    
    return results;
  }
  
  async sendDailyDigest(user, data) {
    return this.send(
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
    console.log('🧪 Sending test email...');
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
  
  // Additional utility methods
  async sendClientOnboardingComplete(client) {
    return this.send(
      client.spocDetails[0]?.email || process.env.ADMIN_EMAIL,
      'Client Onboarding Complete',
      'clientOnboarding',
      {
        clientName: client.businessDetails.clientName,
        clientId: client._id,
        dashboardUrl: `${config.app.url}/clients/${client._id}`
      }
    );
  }
  
  async sendAgencyApproved(agency, tempPassword) {
    return this.send(
      agency.contactDetails.primaryContact.email,
      'Agency Registration Approved',
      'agencyApproved',
      {
        agencyName: agency.companyDetails.companyName,
        email: agency.contactDetails.primaryContact.email,
        tempPassword,
        loginUrl: `${config.app.url}/login`
      }
    );
  }
  
  async sendWorkflowReminder(user, entity) {
    return this.send(
      user.email,
      'Workflow Action Required',
      'workflowReminder',
      {
        userName: user.firstName,
        entityType: entity.constructor.modelName,
        entityName: entity.name || entity.title || entity._id,
        currentStage: entity.workflowStage,
        actionUrl: `${config.app.url}/${entity.constructor.modelName.toLowerCase()}s/${entity._id}`
      }
    );
  }
  
  async sendApprovalReminder(entity) {
    return this.send(
      process.env.ADMIN_EMAIL,
      'Approval Required',
      'approvalReminder',
      {
        entityType: entity.constructor.modelName,
        entityName: entity.name || entity.title || entity._id,
        pendingSince: entity.updatedAt,
        approvalUrl: `${config.app.url}/admin/approvals/${entity._id}`
      }
    );
  }
  
  // For backward compatibility - queueEmail now just sends directly
  async queueEmail(to, subject, template, data) {
    console.log(`📧 Preparing to send email to: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Template: ${template}`);
    return this.send(to, subject, template, data);
  }
}

module.exports = new EmailService();