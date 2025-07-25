// services/emailService.js
const nodemailer = require('nodemailer');
const pug = require('pug');
const htmlToText = require('html-to-text');
const Queue = require('bull');
const config = require('../config/constants');

class EmailService {
  constructor() {
    // Initialize email queue
    this.emailQueue = new Queue('email', config.redis.url);
    
    // Initialize transporter
    if (process.env.NODE_ENV === 'production') {
      // SendGrid configuration
      this.transporter = nodemailer.createTransport({
        service: 'SendGrid',
        auth: {
          user: process.env.SENDGRID_USERNAME,
          pass: process.env.SENDGRID_PASSWORD
        }
      });
    } else {
      // Development - use Mailtrap
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD
       }
     });
   }
   
   // Process email queue
   this.processQueue();
 }
 
 // Process email queue
 processQueue() {
   this.emailQueue.process(async (job) => {
     const { to, subject, template, data } = job.data;
     await this.send(to, subject, template, data);
   });
 }
 
 // Queue email
 async queueEmail(to, subject, template, data) {
   await this.emailQueue.add({ to, subject, template, data });
 }
 
 // Send email
 async send(to, subject, template, data) {
   try {
     // Generate HTML from pug template
     const html = pug.renderFile(
       `${__dirname}/../views/emails/${template}.pug`,
       {
         ...data,
         subject,
         appName: config.app.name,
         appUrl: config.app.url,
         year: new Date().getFullYear()
       }
     );
     
     // Generate text version
     const text = htmlToText.fromString(html);
     
     // Mail options
     const mailOptions = {
       from: `${config.app.name} <${config.email.from}>`,
       to,
       subject,
       html,
       text
     };
     
     // Send email
     await this.transporter.sendMail(mailOptions);
     
     console.log(`Email sent successfully to ${to}`);
   } catch (error) {
     console.error('Email send error:', error);
     throw error;
   }
 }
 
 // Email templates
 async sendWelcome(user) {
   await this.queueEmail(
     user.email,
     'Welcome to ATS Platform',
     'welcome',
     {
       firstName: user.firstName,
       verificationUrl: `${config.app.url}/verify-email/${user.emailVerificationToken}`
     }
   );
 }
 
 async sendPasswordReset(user, resetUrl) {
   await this.queueEmail(
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
   await this.queueEmail(
     candidate.contactInfo.email,
     `Application Status Update - ${candidate.status}`,
     'candidateStatusUpdate',
     {
       candidateName: candidate.fullName,
       status: candidate.status,
       jobTitle: candidate.appliedPosition,
       trackingUrl: `${config.app.url}/candidate/track/${candidate._id}`
     }
   );
 }
 
 async sendInterviewInvitation(candidate, interview) {
   await this.queueEmail(
     candidate.contactInfo.email,
     'Interview Invitation',
     'interviewInvitation',
     {
       candidateName: candidate.fullName,
       interviewDate: interview.scheduledDate,
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
   await this.queueEmail(
     candidate.contactInfo.email,
     'Job Offer - Congratulations!',
     'offerLetter',
     {
       candidateName: candidate.fullName,
       position: offer.position,
       companyName: offer.companyName,
       salary: offer.salary,
       joiningDate: offer.joiningDate,
       offerValidTill: offer.validTill,
       acceptUrl: `${config.app.url}/offer/accept/${offer.token}`,
       declineUrl: `${config.app.url}/offer/decline/${offer.token}`
     }
   );
 }
 
 async sendRequirementAllocation(user, requirement) {
   await this.queueEmail(
     user.email,
     'New Requirement Assigned',
     'requirementAllocation',
     {
       userName: user.firstName,
       jobTitle: requirement.jobTitle,
       clientName: requirement.clientName,
       urgency: requirement.urgency,
       positions: requirement.vacancyCount,
       viewUrl: `${config.app.url}/requirements/${requirement._id}`
     }
   );
 }
 
 async sendDocumentVerificationRequest(candidate, documents) {
   await this.queueEmail(
     candidate.contactInfo.email,
     'Document Verification Required',
     'documentVerification',
     {
       candidateName: candidate.fullName,
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
   
   await this.emailQueue.addBulk(
     jobs.map(job => ({ data: job }))
   );
 }
 
 // Notification digest
 async sendDailyDigest(user, data) {
   await this.queueEmail(
     user.email,
     'Your Daily ATS Summary',
     'dailyDigest',
     {
       userName: user.firstName,
       newCandidates: data.newCandidates,
       interviewsToday: data.interviewsToday,
       pendingActions: data.pendingActions,
       requirementUpdates: data.requirementUpdates
     }
   );
 }
}

module.exports = new EmailService();