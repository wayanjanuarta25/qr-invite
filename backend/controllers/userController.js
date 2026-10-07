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

// Export all users to JSON (Admin only)
exports.exportUsersJson = (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, name, email, password, role, status, created_at 
      FROM users 
      ORDER BY id ASC
    `).all();

    logActivity({
      user_id: req.user.id,
      user_name: req.user.name,
      user_email: req.user.email,
      action: 'USER_EXPORT_JSON',
      details: `Mengekspor ${users.length} akun pengguna ke file JSON`,
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    return res.json({
      success: true,
      version: '1.0',
      exported_at: new Date().toISOString(),
      total_users: users.length,
      users
    });
  } catch (error) {
    console.error('exportUsersJson error:', error);
    return res.status(500).json({ error: 'Gagal mengekspor data akun pengguna: ' + error.message });
  }
};

// Import users from JSON with duplicate detection & resolution (Admin only)
exports.importUsersJson = (req, res) => {
  try {
    const { users, duplicateDecisions = {}, defaultStrategy = 'ask' } = req.body;

    if (!users || !Array.isArray(users)) {
      return res.status(400).json({ error: 'Format JSON tidak valid: properti users harus berupa array.' });
    }

    // Step 1: Detect duplicates
    const duplicateList = [];
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      if (!u.email) continue;
      const em = u.email.trim().toLowerCase();
      const existing = db.prepare('SELECT id, name, email, role, status, created_at FROM users WHERE LOWER(email) = ?').get(em);

      if (existing) {
        duplicateList.push({
          index: i,
          email: em,
          existingUser: {
            id: existing.id,
            name: existing.name,
            email: existing.email,
            role: existing.role,
            status: existing.status,
            created_at: existing.created_at
          },
          newUser: {
            name: u.name || existing.name,
            email: em,
            role: u.role || 'User',
            status: u.status || 'ACTIVE',
            hasPassword: !!u.password
          }
        });
      }
    }

    // If duplicates found and user hasn't made decisions and hasn't chosen a global strategy
    if (duplicateList.length > 0 && Object.keys(duplicateDecisions).length === 0 && defaultStrategy === 'ask') {
      return res.json({
        success: true,
        hasDuplicates: true,
        duplicateCount: duplicateList.length,
        duplicates: duplicateList,
        message: `Ditemukan ${duplicateList.length} akun dengan email yang sudah terdaftar.`
      });
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    const insertUser = db.prepare(`
      INSERT INTO users (name, email, password, role, status)
      VALUES (?, ?, ?, ?, ?)
    `);

    const updateUser = db.prepare(`
      UPDATE users 
      SET name = ?, role = ?, status = ?
      WHERE id = ?
    `);

    const updateUserWithPass = db.prepare(`
      UPDATE users 
      SET name = ?, password = ?, role = ?, status = ?
      WHERE id = ?
    `);

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      if (!u.email) continue;
      const em = u.email.trim().toLowerCase();
      const existing = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(em);

      if (existing) {
        const decision = duplicateDecisions[i] || duplicateDecisions[em] || defaultStrategy;
        if (decision === 'new' || decision === 'overwrite_all') {
          const newRole = (existing.id === 1 && u.role !== 'Admin') ? 'Admin' : (u.role || existing.role);
          if (u.password) {
            const pass = u.password.startsWith('$2') ? u.password : bcrypt.hashSync(u.password, 10);
            updateUserWithPass.run(u.name || existing.name, pass, newRole, u.status || existing.status, existing.id);
          } else {
            updateUser.run(u.name || existing.name, newRole, u.status || existing.status, existing.id);
          }
          updatedCount++;
        } else {
          // 'existing' / 'skip_all'
          skippedCount++;
        }
        continue;
      }

      // New user creation
      const pass = (u.password && u.password.startsWith('$2')) ? u.password : bcrypt.hashSync(u.password || 'admin123', 10);
      insertUser.run(
        u.name || 'User',
        em,
        pass,
        u.role || 'User',
        u.status || 'ACTIVE'
      );
      createdCount++;
    }

    // Auto-sync into seed_data.json
    try {
      const seedPath = path.join(__dirname, '../database/seed_data.json');
      if (fs.existsSync(seedPath)) {
        const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
        seedData.users = db.prepare('SELECT id, name, email, password, role, status, created_at FROM users').all();
        fs.writeFileSync(seedPath, JSON.stringify(seedData, null, 2), 'utf-8');
      }
    } catch (seedErr) {
      console.warn('[USER IMPORT] Could not auto-sync seed_data.json:', seedErr.message);
    }

    logActivity({
      user_id: req.user.id,
      user_name: req.user.name,
      user_email: req.user.email,
      action: 'USER_IMPORT_JSON',
      details: `Import akun selesai: ${createdCount} akun baru, ${updatedCount} diperbarui, ${skippedCount} dipertahankan`,
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    return res.json({
      success: true,
      hasDuplicates: false,
      createdCount,
      updatedCount,
      skippedCount,
      message: `Proses import selesai: ${createdCount} akun baru ditambahkan, ${updatedCount} diperbarui, dan ${skippedCount} mempertahankan data lama.`
    });
  } catch (error) {
    console.error('importUsersJson error:', error);
    return res.status(500).json({ error: 'Gagal mengimpor data akun pengguna: ' + error.message });
  }
};
