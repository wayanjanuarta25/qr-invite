const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { logActivity } = require('../utils/logger');

// Get all users (Admin only)
exports.getUsers = (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, name, email, role, status, created_at 
      FROM users 
      ORDER BY created_at DESC
    `).all();

    return res.json({ success: true, users });
  } catch (error) {
    console.error('getUsers error:', error);
    return res.status(500).json({ error: 'Gagal memuat daftar pengguna.' });
  }
};

// Create new user (Admin only)
exports.createUser = (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nama, email, dan password wajib diisi.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password minimal harus 6 karakter.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'Email sudah terdaftar oleh pengguna lain.' });
    }

    const cleanRole = role === 'User' ? 'User' : 'Admin';
    const hashedPassword = bcrypt.hashSync(password, 10);

    const stmt = db.prepare(`
      INSERT INTO users (name, email, password, role, status)
      VALUES (?, ?, ?, ?, 'ACTIVE')
    `);

    const result = stmt.run(name.trim(), cleanEmail, hashedPassword, cleanRole);

    // Auto-sync into seed_data.json so created user is permanently preserved across deployments
    try {
      const seedPath = path.join(__dirname, '../database/seed_data.json');
      if (fs.existsSync(seedPath)) {
        const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        if (!seedData.users) seedData.users = [];
        const existInSeed = seedData.users.find(u => (u.email || '').toLowerCase() === cleanEmail);
        if (!existInSeed) {
          seedData.users.push({
            id: Number(result.lastInsertRowid),
            name: name.trim(),
            email: cleanEmail,
            password: hashedPassword,
            role: cleanRole,
            status: 'ACTIVE',
            created_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
          });
          fs.writeFileSync(seedPath, JSON.stringify(seedData, null, 2), 'utf8');
        }
      }
    } catch (seedErr) {
      console.error('Auto-sync seed_data users error:', seedErr);
    }

    logActivity(req, 'USER_CREATED', `Membuat akun baru: ${cleanEmail} (${cleanRole})`);

    return res.status(201).json({
      success: true,
      message: 'Akun berhasil dibuat.',
      user: {
        id: result.lastInsertRowid,
        name: name.trim(),
        email: cleanEmail,
        role: cleanRole,
        status: 'ACTIVE'
      }
    });
  } catch (error) {
    console.error('createUser error:', error);
    return res.status(500).json({ error: 'Gagal membuat akun: ' + error.message });
  }
};

// Update user (Admin only)
exports.updateUser = (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, status } = req.body;

    const targetUser = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    }

    // Prevent changing role of the primary admin (id: 1) if demoting
    if (Number(id) === 1 && role && role !== 'Admin') {
      return res.status(400).json({ error: 'Akun Super Administrator utama tidak dapat diubah menjadi User biasa.' });
    }

    const cleanEmail = email ? email.trim().toLowerCase() : targetUser.email;
    if (cleanEmail !== targetUser.email) {
      const emailConflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(cleanEmail, id);
      if (emailConflict) {
        return res.status(400).json({ error: 'Email tersebut sudah digunakan oleh akun lain.' });
      }
    }

    let passwordHash = null;
    if (password && password.trim()) {
      if (password.trim().length < 6) {
        return res.status(400).json({ error: 'Password baru minimal harus 6 karakter.' });
      }
      passwordHash = bcrypt.hashSync(password.trim(), 10);
    }

    const cleanRole = role ? (role === 'User' ? 'User' : 'Admin') : targetUser.role;
    const cleanStatus = status ? (status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE') : 'ACTIVE';
    const cleanName = name ? name.trim() : targetUser.name;

    if (passwordHash) {
      db.prepare(`
        UPDATE users 
        SET name = ?, email = ?, password = ?, role = ?, status = ?
        WHERE id = ?
      `).run(cleanName, cleanEmail, passwordHash, cleanRole, cleanStatus, id);
    } else {
      db.prepare(`
        UPDATE users 
        SET name = ?, email = ?, role = ?, status = ?
        WHERE id = ?
      `).run(cleanName, cleanEmail, cleanRole, cleanStatus, id);
    }

    logActivity(req, 'USER_UPDATED', `Mengubah profil/role akun ID: #${id} (${cleanEmail})`);

    // Sync seed_data.json on update
    try {
      const seedPath = path.join(__dirname, '../database/seed_data.json');
      if (fs.existsSync(seedPath)) {
        const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        if (seedData.users) {
          const su = seedData.users.find(u => String(u.id) === String(id) || (u.email || '').toLowerCase() === user.email.toLowerCase());
          if (su) {
            if (name) su.name = name.trim();
            if (email) su.email = email.trim().toLowerCase();
            if (role) su.role = role;
            if (status) su.status = status;
            if (password && password.trim()) su.password = hashedPassword;
            fs.writeFileSync(seedPath, JSON.stringify(seedData, null, 2), 'utf8');
          }
        }
      }
    } catch (e) {}

    return res.json({
      success: true,
      message: 'Data akun berhasil diperbarui.'
    });
  } catch (error) {
    console.error('updateUser error:', error);
    return res.status(500).json({ error: 'Gagal memperbarui akun: ' + error.message });
  }
};

// Delete user (Admin only)
exports.deleteUser = (req, res) => {
  try {
    const { id } = req.params;

    if (Number(id) === Number(req.user.id)) {
      return res.status(400).json({ error: 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif.' });
    }

    if (Number(id) === 1) {
      return res.status(400).json({ error: 'Akun Super Administrator default tidak dapat dihapus.' });
    }

    const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);

    logActivity(req, 'USER_DELETED', `Menghapus akun: ${user.email} (ID: #${id})`);

    // Sync seed_data.json on delete
    try {
      const seedPath = path.join(__dirname, '../database/seed_data.json');
      if (fs.existsSync(seedPath)) {
        const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        if (seedData.users) {
          seedData.users = seedData.users.filter(u => String(u.id) !== String(id) && (u.email || '').toLowerCase() !== user.email.toLowerCase());
          fs.writeFileSync(seedPath, JSON.stringify(seedData, null, 2), 'utf8');
        }
      }
    } catch (e) {}

    return res.json({
      success: true,
      message: `Akun ${user.name} berhasil dihapus.`
    });
  } catch (error) {
    console.error('deleteUser error:', error);
    return res.status(500).json({ error: 'Gagal menghapus akun.' });
  }
};

// Get Activity Logs (Admin only)
exports.getActivityLogs = (req, res) => {
  try {
    const { limit = 100, user_id, action } = req.query;

    let query = 'SELECT * FROM activity_logs WHERE 1=1';
    const params = [];

    if (user_id && user_id !== 'all') {
      query += ' AND user_id = ?';
      params.push(user_id);
    }

    if (action && action !== 'all') {
      query += ' AND action LIKE ?';
      params.push(`%${action}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(Math.min(Number(limit) || 100, 500));

    const logs = db.prepare(query).all(...params);

    return res.json({ success: true, logs });
  } catch (error) {
    console.error('getActivityLogs error:', error);
    return res.status(500).json({ error: 'Gagal memuat log aktivitas.' });
  }
};
