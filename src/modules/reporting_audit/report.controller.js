const reportService = require('./report.service');

class ReportController {
  async getReport(req, res, next) {
    try {
      const { report_type } = req.params;
      const { start_date, end_date, format } = req.query;
      const userRole = req.user.role;

      const report = await reportService.generateSystemReport(
        report_type,
        start_date,
        end_date,
        userRole,
        format || 'JSON'
      );

      if (format && format.toUpperCase() === 'CSV') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
        return res.status(200).send(report.csv_content);
      }

      return res.status(200).json({
        success: true,
        data: report
      });
    } catch (err) {
      next(err);
    }
  }

  async getDashboard(req, res, next) {
    try {
      const report = await reportService.generateSystemReport(
        'DASHBOARD',
        null,
        null,
        req.user.role,
        'JSON'
      );
      return res.status(200).json({
        success: true,
        data: report.data
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ReportController();
