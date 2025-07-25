// services/workflowService.js
const mongoose = require('mongoose');
const Client = require('../models/Client');
const Candidate = require('../models/Candidate');
const Requirement = require('../models/Requirement');
const EmailService = require('./emailService');
const excel = require('exceljs');
const csv = require('csv-writer');
const PDFDocument = require('pdfkit');

class WorkflowService {
  // Client workflow
  async initializeClientWorkflow(clientId, session) {
    // Create workflow stages
    const stages = [
      { name: 'Business Details', status: 'completed', completedAt: new Date() },
      { name: 'Address & Billing', status: 'pending' },
      { name: 'Documents', status: 'pending' },
      { name: 'Leave Policy', status: 'pending' },
      { name: 'Verification Policy', status: 'pending' },
      { name: 'SPOC Details', status: 'pending' },
      { name: 'Review & Approval', status: 'pending' }
    ];
    
    // Store workflow status
    await Client.findByIdAndUpdate(
      clientId,
      {
        'workflow.stages': stages,
        'workflow.currentStage': 'Address & Billing',
        'workflow.progress': 14 // 1/7 stages
      },
      { session }
    );
  }
  
  // Update workflow stage
  async updateWorkflowStage(entityType, entityId, stageName, status) {
    const Model = this.getModel(entityType);
    const entity = await Model.findById(entityId);
    
    if (!entity) {
      throw new Error('Entity not found');
    }
    
    const stageIndex = entity.workflow.stages.findIndex(s => s.name === stageName);
    
    if (stageIndex === -1) {
      throw new Error('Stage not found');
    }
    
    entity.workflow.stages[stageIndex].status = status;
    entity.workflow.stages[stageIndex].completedAt = status === 'completed' ? new Date() : null;
    
    // Update current stage
    if (status === 'completed' && stageIndex < entity.workflow.stages.length - 1) {
      entity.workflow.currentStage = entity.workflow.stages[stageIndex + 1].name;
    }
    
    // Calculate progress
    const completedStages = entity.workflow.stages.filter(s => s.status === 'completed').length;
    entity.workflow.progress = Math.round((completedStages / entity.workflow.stages.length) * 100);
    
    await entity.save();
    
    // Send notifications
    if (entity.workflow.progress === 100) {
      await this.sendCompletionNotification(entityType, entity);
    }
    
    return entity.workflow;
  }
  
  // Get next step in workflow
  getNextStep(currentStage) {
    const stageFlow = {
      'Personal Details': 'Education',
      'Education': 'Employment',
      'Employment': 'KYC',
      'KYC': 'Financial',
      'Financial': 'Review',
      'Review': 'Complete'
    };
    
    return stageFlow[currentStage] || null;
  }
  
  // Validate stage completion
  async validateStageCompletion(entityType, entityId, stageName) {
    const Model = this.getModel(entityType);
    const entity = await Model.findById(entityId);
    
    const validations = {
      'Candidate': {
        'Personal Details': ['personalDetails', 'contactInfo', 'emergencyContact'],
        'Education': ['education'],
        'Employment': ['employment'],
        'KYC': ['kyc', 'bankDetails', 'address'],
        'Financial': ['financialInfo']
      },
      'Client': {
        'Business Details': ['businessType', 'businessDetails'],
        'Address & Billing': ['addressDetails', 'billingInfo'],
        'Documents': ['documents'],
        'Leave Policy': ['leavePolicy'],
        'Verification Policy': ['verificationPolicy'],
        'SPOC Details': ['spocDetails']
      }
    };
    
    const requiredFields = validations[entityType]?.[stageName] || [];
    const errors = [];
    
    for (const field of requiredFields) {
      if (!entity[field] || (Array.isArray(entity[field]) && entity[field].length === 0)) {
        errors.push(`${field} is required`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  // Calculate financial metrics
  calculateFinancialMetrics(financialInfo) {
    const {
      businessType,
      lastWithdrawnSalary,
      offeredSalary,
      billRate,
      mspFeePercentage
    } = financialInfo;
    
    const calculated = {};
    
    // Hike percentage
    calculated.hikePercentage = ((offeredSalary - lastWithdrawnSalary) / lastWithdrawnSalary) * 100;
    
    if (businessType === 'Contract' || businessType === 'Contract MSP') {
      // Gross margin
      calculated.grossMarginAmount = billRate - offeredSalary;
      calculated.grossMarginPercentage = (calculated.grossMarginAmount / billRate) * 100;
      
      // MSP calculations
      if (businessType === 'Contract MSP' && mspFeePercentage) {
        const mspFee = calculated.grossMarginAmount * (mspFeePercentage / 100);
        calculated.grossMarginAmountAfterMSP = calculated.grossMarginAmount - mspFee;
        calculated.grossMarginPercentageAfterMSP = (calculated.grossMarginAmountAfterMSP / billRate) * 100;
      }
      
      // Leave cost (assuming 1.5 days per month)
      calculated.leaveCost = (offeredSalary / 21) * 1.5;
      
      // After leave cost margin
      const baseMargin = businessType === 'Contract MSP' ? 
        calculated.grossMarginAmountAfterMSP : 
        calculated.grossMarginAmount;
      
      calculated.afterLeaveCostMarginAmount = baseMargin - calculated.leaveCost;
      calculated.afterLeaveCostMarginPercentage = (calculated.afterLeaveCostMarginAmount / billRate) * 100;
    } else if (businessType === 'Permanent' || businessType === 'Permanent MSP') {
      calculated.billableAmount = billRate;
    }
    
    return calculated;
  }
  
  // Export to CSV
  async exportToCsv(data, type) {
    const createCsvWriter = csv.createObjectCsvWriter;
    
    const headers = this.getExportHeaders(type);
    const records = this.prepareExportData(data, type);
    
    const csvWriter = createCsvWriter({
      path: `/tmp/${type}_export_${Date.now()}.csv`,
      header: headers
    });
    
    await csvWriter.writeRecords(records);
    
    // Read file and return buffer
    const fs = require('fs').promises;
    const buffer = await fs.readFile(csvWriter.path);
    
    // Clean up
    await fs.unlink(csvWriter.path);
    
    return {
      buffer,
      contentType: 'text/csv'
    };
  }
  
  // Export to Excel
  async exportToExcel(data, type) {
    const workbook = new excel.Workbook();
    const worksheet = workbook.addWorksheet(type);
    
    // Add headers
    const headers = this.getExportHeaders(type);
    worksheet.columns = headers.map(h => ({
      header: h.title,
      key: h.id,
      width: 15
    }));
    
    // Add data
    const records = this.prepareExportData(data, type);
    worksheet.addRows(records);
    
    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    return {
      buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
  }
  
  // Generate reports
  async generateReport(type, filters, format = 'pdf') {
    const data = await this.getReportData(type, filters);
    
    if (format === 'pdf') {
      return this.generatePdfReport(type, data);
    } else if (format === 'excel') {
      return this.exportToExcel(data, type);
    }
    
    throw new Error('Invalid report format');
  }
  
  // Get export headers
  getExportHeaders(type) {
    const headers = {
      candidate: [
        { id: 'candidateCode', title: 'Candidate ID' },
        { id: 'fullName', title: 'Full Name' },
        { id: 'email', title: 'Email' },
        { id: 'phone', title: 'Phone' },
        { id: 'status', title: 'Status' },
        { id: 'currentCTC', title: 'Current CTC' },
        { id: 'expectedCTC', title: 'Expected CTC' },
        { id: 'experience', title: 'Experience' },
        { id: 'location', title: 'Location' },
        { id: 'createdAt', title: 'Applied Date' }
      ],
      client: [
        { id: 'clientCode', title: 'Client ID' },
        { id: 'clientName', title: 'Client Name' },
        { id: 'businessType', title: 'Business Type' },
        { id: 'industry', title: 'Industry' },
        { id: 'spocCount', title: 'SPOC Count' },
        { id: 'activeRequirements', title: 'Active Requirements' },
        { id: 'createdAt', title: 'Onboarded Date' }
      ],
      requirement: [
        { id: 'requirementCode', title: 'Requirement ID' },
        { id: 'jobTitle', title: 'Job Title' },
        { id: 'clientName', title: 'Client' },
        { id: 'location', title: 'Location' },
        { id: 'experience', title: 'Experience Range' },
        { id: 'salary', title: 'Salary Range' },
        { id: 'vacancies', title: 'Vacancies' },
        { id: 'filled', title: 'Filled' },
        { id: 'status', title: 'Status' },
        { id: 'createdAt', title: 'Created Date' }
      ]
    };
    
    return headers[type] || [];
  }
  
  // Prepare export data
  prepareExportData(data, type) {
    return data.map(item => {
      if (type === 'candidate') {
        return {
          candidateCode: item.candidateCode,
          fullName: item.fullName,
          email: item.contactInfo?.email,
          phone: item.contactInfo?.phoneNo,
          status: item.status,
          currentCTC: item.recruiterCallData?.salaryDetails?.currentCTC,
          expectedCTC: item.recruiterCallData?.salaryDetails?.expectedCTC,
          experience: item.recruiterCallData?.totalExperience,
          location: item.recruiterCallData?.currentCity,
          createdAt: new Date(item.createdAt).toLocaleDateString()
        };
      } else if (type === 'client') {
        return {
          clientCode: item.clientCode,
          clientName: item.businessDetails?.clientName,
          businessType: item.businessType,
          industry: item.businessDetails?.industry,
          spocCount: item.spocDetails?.length || 0,
          activeRequirements: item.activeRequirements || 0,
          createdAt: new Date(item.createdAt).toLocaleDateString()
        };
      } else if (type === 'requirement') {
        return {
          requirementCode: item.requirementCode,
          jobTitle: item.jobTitle,
          clientName: item.clientId?.businessDetails?.clientName,
          location: item.jobLocation,
          experience: `${item.workExpMin}-${item.workExpMax} years`,
          salary: `${item.salaryMin}-${item.salaryMax}`,
          vacancies: item.vacancyCount,
          filled: item.filledCount,
          status: item.status,
          createdAt: new Date(item.createdAt).toLocaleDateString()
        };
      }
      
      return item;
    });
  }
  
  // Get model by entity type
  getModel(entityType) {
    const models = {
      'Client': Client,
      'Candidate': Candidate,
      'Requirement': Requirement
    };
    
    return models[entityType];
  }
  
  // Send completion notification
  async sendCompletionNotification(entityType, entity) {
    // Implementation depends on entity type
    if (entityType === 'Candidate') {
      await EmailService.sendCandidateComplete(entity);
    } else if (entityType === 'Client') {
      await EmailService.sendClientOnboardingComplete(entity);
    }
  }
  
  // Automated workflow actions
  async processAutomatedActions() {
    // Process pending approvals
    await this.processPendingApprovals();
    
    // Send reminders
    await this.sendWorkflowReminders();
    
    // Update stale records
    await this.updateStaleRecords();
  }
  
  // Process pending approvals
  async processPendingApprovals() {
    // Find entities pending approval for more than 24 hours
    const pendingClients = await Client.find({
      'workflow.currentStage': 'Review & Approval',
      'workflow.stages.6.status': 'pending',
      updatedAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    for (const client of pendingClients) {
      await EmailService.sendApprovalReminder(client);
    }
  }
  
  // Send workflow reminders
  async sendWorkflowReminders() {
    // Find incomplete workflows older than 3 days
    const incompleteCandidates = await Candidate.find({
      workflowStage: { $ne: 'Complete' },
      updatedAt: { $lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
    }).populate('createdBy assignedTo');
    
    for (const candidate of incompleteCandidates) {
      const recipient = candidate.assignedTo || candidate.createdBy;
      await EmailService.sendWorkflowReminder(recipient, candidate);
    }
  }
  
  // Update stale records
  async updateStaleRecords() {
    // Mark requirements as on hold if no activity for 30 days
    await Requirement.updateMany(
      {
        status: 'Active',
        updatedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      },
      {
        status: 'On Hold',
        $push: {
          statusHistory: {
            status: 'On Hold',
            reason: 'No activity for 30 days',
            changedAt: new Date()
          }
        }
      }
    );
  }
}

module.exports = new WorkflowService();