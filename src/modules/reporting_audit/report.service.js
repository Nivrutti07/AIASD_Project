const reportRepository = require('./report.repository');
const { convertToCSV, saveCSVToFile } = require('../../utils/csvExporter');
const { AppError } = require('../../middleware/errorHandler');

class ReportService {
  /**
   * FR-12: generate_system_report(report_type: str, start_date: date, end_date: date, user_role: str) -> Report
   */
  async generateSystemReport(reportType, startDate = null, endDate = null, userRole = null, exportFormat = 'JSON') {
    const type = (reportType || 'DASHBOARD').toUpperCase();

    // Role-based authorization enforcement
    if (type === 'AUDIT' && userRole !== 'ADMIN') {
      throw new AppError('Unauthorized: Only Administrator can access full audit log reports', 403, 'FORBIDDEN');
    }

    if (type === 'INVENTORY' && userRole !== 'ADMIN' && userRole !== 'BLOOD_BANK_STAFF') {
      throw new AppError('Unauthorized: Access restricted to Blood Bank Staff and Admin', 403, 'FORBIDDEN');
    }

    let reportData = null;
    let filename = '';

    switch (type) {
      case 'DASHBOARD':
        reportData = await reportRepository.getDashboardMetrics();
        filename = `dashboard_metrics_${Date.now()}.csv`;
        break;

      case 'INVENTORY':
        reportData = await reportRepository.getInventoryReport(startDate, endDate);
        filename = `inventory_report_${Date.now()}.csv`;
        break;

      case 'REQUESTS':
        reportData = await reportRepository.getRequestsReport(startDate, endDate);
        filename = `requests_report_${Date.now()}.csv`;
        break;

      case 'AUDIT':
        reportData = await reportRepository.getAuditLogs(startDate, endDate);
        filename = `audit_logs_${Date.now()}.csv`;
        break;

      default:
        throw new AppError(`Unknown report type: '${reportType}'. Allowed: DASHBOARD, INVENTORY, REQUESTS, AUDIT`, 400, 'INVALID_REPORT_TYPE');
    }

    // Handle CSV export
    if (exportFormat.toUpperCase() === 'CSV') {
      const dataArray = Array.isArray(reportData) ? reportData : [reportData];
      const csvText = convertToCSV(dataArray);
      const filePath = saveCSVToFile(filename, csvText);

      return {
        report_type: type,
        format: 'CSV',
        filename,
        file_path: filePath,
        csv_content: csvText,
        record_count: dataArray.length
      };
    }

    return {
      report_type: type,
      format: 'JSON',
      generated_at: new Date().toISOString(),
      data: reportData
    };
  }
}

module.exports = new ReportService();
