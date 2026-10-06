require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Initialize database
require('./database/db');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const userRoutes = require('./routes/users');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const guestRoutes = require('./routes/guests');
const scannerRoutes = require('./routes/scanner');
const liveRoutes = require('./routes/live');
const authController = require('./controllers/authController');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for proper https & host detection behind reverse proxy
app.set('trust proxy', 1);

// Security Headers with Helmet
app.use(helmet({
  contentSecurityPolicy: false, // allow loading local scripts, styles, and cdn assets
  crossOriginEmbedderPolicy: false
}));

// Rate limiter for authentication routes to prevent brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 login attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan masuk dari IP Anda. Silakan coba lagi setelah 15 menit.' }
});

// General API Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300, // Limit each IP to 300 requests per minute
  standardHeaders: true,
  legacyHeaders: false
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use('/api', apiLimiter);

// Static files
const qrPath = path.join(__dirname, '..', 'qr');
const frontendPath = path.join(__dirname, '..', 'frontend');
const assetsPath = path.join(frontendPath, 'assets');

app.use('/qr', express.static(qrPath));
app.use('/assets', express.static(assetsPath));

// API Routes
// Direct /api/login with brute-force protection
app.post('/api/login', authLimiter, authController.login);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/guests', guestRoutes);
// Mount scanner at /api and /api/check
app.use('/api', scannerRoutes);
// Mount live TV display stream & data
app.use('/api/live', liveRoutes);

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

// Live TV Welcome Screen Display
app.get('/tv', (req, res) => {
  res.sendFile(path.join(frontendPath, 'tv.html'));
});

app.get('/display', (req, res) => {
  res.sendFile(path.join(frontendPath, 'tv.html'));
});

app.get('/live', (req, res) => {
  res.sendFile(path.join(frontendPath, 'tv.html'));
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
