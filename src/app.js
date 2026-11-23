const express = require('express');
const cors = require('cors');
const { errorHandler } = require('./middleware/errorHandler');

// Route modules
const authRoutes = require('./modules/auth/auth.routes');
const donorRoutes = require('./modules/donor/donor.routes');
const eligibilityRoutes = require('./modules/eligibility/eligibility.routes');
const compatibilityRoutes = require('./modules/compatibility/compatibility.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const requestRoutes = require('./modules/emergency_request/request.routes');
const reservationRoutes = require('./modules/reservation/reservation.routes');
const driveRoutes = require('./modules/donation_drive/drive.routes');
const reportRoutes = require('./modules/reporting_audit/report.routes');

const app = express();

// Standard middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    system: 'Blood Donation and Emergency Request System',
    version: '1.0.0'
  });
});

// Team Information endpoint
app.get('/api/team', (req, res) => {
  res.status(200).json({
    project: 'Blood Donation and Emergency Request System',
    team: [
      { roll_no: '323', usn: '01FE24BCS159', name: 'Kedar Nimbalkar' },
      { roll_no: '332', usn: '01FE24BCS168', name: 'Nivrutti Patil' },
      { roll_no: '333', usn: '01FE24BCS169', name: 'Sanskruti Agasgekar' },
      { roll_no: '335', usn: '01FE24BCS171', name: 'Shreya Pavaskar' }
    ]
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/donors', donorRoutes);
app.use('/api/eligibility', eligibilityRoutes);
app.use('/api/compatibility', compatibilityRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/drives', driveRoutes);
app.use('/api/reports', reportRoutes);

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `The endpoint ${req.method} ${req.originalUrl} does not exist.`
    }
  });
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
