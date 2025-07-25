// controllers/workflowController.js
const WorkflowService = require('../services/workflowService');
const { AppError } = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

class WorkflowController {
  // Get workflow status
  getWorkflowStatus = catchAsync(async (req, res, next) => {
    const { entityType, entityId } = req.params;
    
    const Model = WorkflowService.getModel(entityType);
    const entity = await Model.findById(entityId);
    
    if (!entity) {
      return next(new AppError('Entity not found', 404));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        workflow: entity.workflow || {
          currentStage: entity.workflowStage,
          progress: entity.workflowProgress
        }
      }
    });
  });
  
  // Update workflow stage
  updateWorkflowStage = catchAsync(async (req, res, next) => {
    const { entityType, entityId } = req.params;
    const { stage, status } = req.body;
    
    const workflow = await WorkflowService.updateWorkflowStage(
      entityType,
      entityId,
      stage,
      status
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        workflow
      }
    });
  });
  
  // Validate stage
  validateStage = catchAsync(async (req, res, next) => {
    const { entityType, entityId } = req.params;
    const { stage } = req.body;
    
    const validation = await WorkflowService.validateStageCompletion(
      entityType,
      entityId,
      stage
    );
    
    res.status(200).json({
      status: 'success',
      data: validation
    });
  });
  
  // Get pipeline report
  getPipelineReport = catchAsync(async (req, res, next) => {
    const { startDate, endDate, groupBy = 'status' } = req.query;
    
    const report = await WorkflowService.generateReport(
      'pipeline',
      { startDate, endDate, groupBy }
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        report
      }
    });
  });
  
  // Generate report
  generateReport = catchAsync(async (req, res, next) => {
    const { type, filters, format } = req.body;
    
    const report = await WorkflowService.generateReport(
      type,
      filters,
      format
    );
    
    if (format === 'pdf' || format === 'excel') {
      res.setHeader('Content-Type', report.contentType);
      res.setHeader('Content-Disposition', `attachment; filename=report_${Date.now()}.${format}`);
      res.send(report.buffer);
    } else {
      res.status(200).json({
        status: 'success',
        data: {
          report
        }
      });
    }
  });
  
  // Export data
  exportData = catchAsync(async (req, res, next) => {
    const { type } = req.params;
    const { format = 'csv', ...filters } = req.query;
    
    const Model = WorkflowService.getModel(type);
    const data = await Model.find(filters);
    
    let exportResult;
    if (format === 'csv') {
      exportResult = await WorkflowService.exportToCsv(data, type);
    } else if (format === 'excel') {
      exportResult = await WorkflowService.exportToExcel(data, type);
    } else {
      return next(new AppError('Invalid export format', 400));
    }
    
    res.setHeader('Content-Type', exportResult.contentType);
    res.setHeader('Content-Disposition', `attachment; filename=${type}_export_${Date.now()}.${format}`);
    res.send(exportResult.buffer);
  });
}

module.exports = new WorkflowController();