require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Initialize database
require('./database/db');

const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const guestRoutes = require('./routes/guests');
const scannerRoutes = require('./routes/scanner');
const authController = require('./controllers/authController');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
const qrPath = path.join(__dirname, '..', 'qr');
const frontendPath = path.join(__dirname, '..', 'frontend');
const assetsPath = path.join(frontendPath, 'assets');

app.use('/qr', express.static(qrPath));
app.use('/assets', express.static(assetsPath));

// API Routes
// Direct /api/login per specification
app.post('/api/login', authController.login);
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/guests', guestRoutes);
// Mount scanner at /api and /api/check
app.use('/api', scannerRoutes);

// Frontend Page Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(frontendPath, 'admin.html'));
});

app.get('/scanner', (req, res) => {
  res.sendFile(path.join(frontendPath, 'scanner.html'));
});

// Public digital invitation / check route for guests
app.get('/check/:token', (req, res) => {
  res.sendFile(path.join(frontendPath, 'check.html'));
});

// Fallback for undefined routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint API tidak ditemukan' });
  }
  res.status(404).sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Terjadi kesalahan internal pada server' });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  DIGITAL INVITATION & QR ATTENDANCE PLATFORM`);
  console.log(`  Server running at: http://localhost:${PORT}`);
  console.log(`  Admin Panel      : http://localhost:${PORT}/admin`);
  console.log(`  Scanner Page     : http://localhost:${PORT}/scanner`);
  console.log(`  Login Page       : http://localhost:${PORT}/login`);
  console.log(`====================================================`);
});

module.exports = app;
