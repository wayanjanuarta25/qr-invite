const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { JWT_SECRET } = require('../middleware/authMiddleware');
const { logActivity } = require('../utils/logger');

exports.login = (req, res) => {
  try {
    const { email, password, remember } = req.body;

    if (!email || !password) {
      logActivity(req, 'LOGIN_FAILED', 'Percobaan login tanpa email atau password');
      return res.status(400).json({ error: 'Email dan password wajib diisi.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());

    if (!user) {
      logActivity(req, 'LOGIN_FAILED', `Akun tidak ditemukan: ${email}`);
      return res.status(401).json({ error: 'Email atau password salah.' });
    }

    if (user.status && user.status !== 'ACTIVE') {
      logActivity(req, 'LOGIN_BLOCKED', `Percobaan login akun non-aktif: ${email}`);
      return res.status(403).json({ error: 'Akun Anda dinonaktifkan. Silakan hubungi Administrator.' });
    }

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      logActivity(req, 'LOGIN_FAILED', `Password salah untuk user: ${email}`);
      return res.status(401).json({ error: 'Email atau password salah.' });
    }

    const expiresIn = remember ? '30d' : '24h';
    const role = user.role || 'Admin';

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: role },
      JWT_SECRET,
      { expiresIn }
    );

    req.user = { id: user.id, name: user.name, email: user.email, role: role };
    logActivity(req, 'LOGIN_SUCCESS', `Login berhasil sebagai ${role}`);

    return res.json({
      success: true,
      message: 'Login berhasil.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server saat login.' });
  }
};

exports.getMe = (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, role, status, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User tidak ditemukan.' });
    }
    return res.json({ success: true, user });
  } catch (error) {
    console.error('GetMe error:', error);
    return res.status(500).json({ error: 'Gagal mengambil data user.' });
  }
};
