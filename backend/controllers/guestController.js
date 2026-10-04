const db = require('../database/db');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const crypto = require('crypto');

const qrDir = path.join(__dirname, '..', '..', 'qr');

// Helper to generate a clean, unique alphanumeric 12-char token like 8HD82KS92JS82
function generateUniqueToken() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let token = '';
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) {
    token += chars[bytes[i] % chars.length];
  }
  return token;
}

// Helper to generate and save QR code
async function createQrImage(token, req) {
  const fileName = `qr_${token}.png`;
  const filePath = path.join(qrDir, fileName);

  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host') || 'localhost:3000';
  const checkUrl = `${protocol}://${host}/check/${token}`;

  await QRCode.toFile(filePath, checkUrl, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 350,
    color: {
      dark: '#0F172A',
      light: '#FFFFFF'
    }
  });

  return `/qr/${fileName}`;
}

exports.getAllGuests = (req, res) => {
  try {
    const { event_id, search, category, status } = req.query;

    let query = `
      SELECT 
        g.*,
        e.name as event_name,
        e.date as event_date,
        e.location as event_location
      FROM guests g
      JOIN events e ON g.event_id = e.id
      WHERE 1=1
    `;
    const params = [];

    if (event_id && event_id !== 'all') {
      query += ` AND g.event_id = ?`;
      params.push(event_id);
    }

    if (category && category !== 'all') {
      query += ` AND g.category = ?`;
      params.push(category);
    }

    if (status && status !== 'all') {
      query += ` AND g.attendance_status = ?`;
      params.push(status);
    }

    if (search && search.trim()) {
      query += ` AND (g.name LIKE ? OR g.phone LIKE ? OR g.qr_token LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    query += ` ORDER BY g.created_at DESC`;

    const guests = db.prepare(query).all(...params);

    return res.json({ success: true, count: guests.length, guests });
  } catch (error) {
    console.error('Get guests error:', error);
    return res.status(500).json({ error: 'Gagal mengambil data tamu.' });
  }
};

exports.getGuestById = (req, res) => {
  try {
    const { id } = req.params;
    const guest = db.prepare(`
      SELECT 
        g.*,
        e.name as event_name,
        e.date as event_date,
        e.location as event_location
      FROM guests g
      JOIN events e ON g.event_id = e.id
      WHERE g.id = ?
    `).get(id);

    if (!guest) {
      return res.status(404).json({ error: 'Tamu tidak ditemukan.' });
    }

    return res.json({ success: true, guest });
  } catch (error) {
    console.error('Get guest by id error:', error);
    return res.status(500).json({ error: 'Gagal mengambil data tamu.' });
  }
};

exports.createGuest = async (req, res) => {
  try {
    const { event_id, name, phone, category } = req.body;

    if (!event_id || !name) {
      return res.status(400).json({ error: 'ID Acara dan Nama Tamu wajib diisi.' });
    }

    // Verify event exists
    const event = db.prepare('SELECT id, name FROM events WHERE id = ?').get(event_id);
    if (!event) {
      return res.status(400).json({ error: 'Event tidak valid.' });
    }

    // Generate unique token
    let qr_token = generateUniqueToken();
    let duplicateCheck = db.prepare('SELECT id FROM guests WHERE qr_token = ?').get(qr_token);
    while (duplicateCheck) {
      qr_token = generateUniqueToken();
      duplicateCheck = db.prepare('SELECT id FROM guests WHERE qr_token = ?').get(qr_token);
    }

    // Generate QR file
    const qr_image = await createQrImage(qr_token, req);

    const stmt = db.prepare(`
      INSERT INTO guests (event_id, name, phone, category, qr_token, qr_image, attendance_status)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    `);

    const result = stmt.run(
      event_id,
      name.trim(),
      (phone || '').trim(),
      category || 'General',
      qr_token,
      qr_image
    );

    const newGuest = db.prepare(`
      SELECT g.*, e.name as event_name, e.date as event_date, e.location as event_location
      FROM guests g
      JOIN events e ON g.event_id = e.id
      WHERE g.id = ?
    `).get(result.lastInsertRowid);

    return res.status(201).json({
      success: true,
      message: 'Tamu berhasil didaftarkan.',
      guest: newGuest
    });
  } catch (error) {
    console.error('Create guest error:', error);
    return res.status(500).json({ error: 'Gagal menambahkan tamu baru.' });
  }
};

exports.updateGuest = (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, category, attendance_status } = req.body;

    const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(id);
    if (!guest) {
      return res.status(404).json({ error: 'Tamu tidak ditemukan.' });
    }

    let arrival_time = guest.arrival_time;
    if (attendance_status === 'PRESENT' && guest.attendance_status !== 'PRESENT') {
      arrival_time = new Date().toISOString().replace('T', ' ').substring(0, 19);
    } else if (attendance_status === 'PENDING') {
      arrival_time = null;
    }

    db.prepare(`
      UPDATE guests
      SET 
        name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        category = COALESCE(?, category),
        attendance_status = COALESCE(?, attendance_status),
        arrival_time = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : null,
      phone !== undefined ? phone.trim() : null,
      category !== undefined ? category : null,
      attendance_status !== undefined ? attendance_status : null,
      arrival_time,
      id
    );

    const updated = db.prepare(`
      SELECT g.*, e.name as event_name, e.date as event_date, e.location as event_location
      FROM guests g
      JOIN events e ON g.event_id = e.id
      WHERE g.id = ?
    `).get(id);

    return res.json({
      success: true,
      message: 'Data tamu berhasil diperbarui.',
      guest: updated
    });
  } catch (error) {
    console.error('Update guest error:', error);
    return res.status(500).json({ error: 'Gagal memperbarui data tamu.' });
  }
};

exports.deleteGuest = (req, res) => {
  try {
    const { id } = req.params;
    const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(id);
    if (!guest) {
      return res.status(404).json({ error: 'Tamu tidak ditemukan.' });
    }

    // Try deleting QR image file
    if (guest.qr_image) {
      const fileName = path.basename(guest.qr_image);
      const filePath = path.join(qrDir, fileName);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('Could not delete QR file:', filePath);
        }
      }
    }

    db.prepare('DELETE FROM guests WHERE id = ?').run(id);

    return res.json({
      success: true,
      message: 'Tamu berhasil dihapus.'
    });
  } catch (error) {
    console.error('Delete guest error:', error);
    return res.status(500).json({ error: 'Gagal menghapus data tamu.' });
  }
};

exports.toggleAttendance = (req, res) => {
  try {
    const { id } = req.params;
    const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(id);
    if (!guest) {
      return res.status(404).json({ error: 'Tamu tidak ditemukan.' });
    }

    const newStatus = guest.attendance_status === 'PRESENT' ? 'PENDING' : 'PRESENT';
    const newArrival = newStatus === 'PRESENT' ? new Date().toISOString().replace('T', ' ').substring(0, 19) : null;

    db.prepare(`
      UPDATE guests
      SET attendance_status = ?, arrival_time = ?
      WHERE id = ?
    `).run(newStatus, newArrival, id);

    const updated = db.prepare('SELECT * FROM guests WHERE id = ?').get(id);
    return res.json({
      success: true,
      message: `Status kehadiran berhasil diubah menjadi ${newStatus}.`,
      guest: updated
    });
  } catch (error) {
    console.error('Toggle attendance error:', error);
    return res.status(500).json({ error: 'Gagal mengubah status kehadiran.' });
  }
};
