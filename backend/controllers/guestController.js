const { logActivity } = require('../utils/logger');
const { generateInvitationPdf } = require('../utils/invitationPdfGenerator');
const db = require('../database/db');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const crypto = require('crypto');
const JSZip = require('jszip');
const liveController = require('./liveController');

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

// Helper to get current Jakarta (WIB) time: "YYYY-MM-DD HH:mm:ss"
function getJakartaTimeString() {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return formatter.format(new Date()).replace('T', ' ');
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
      query += ` AND (
        g.name LIKE ? OR 
        g.phone LIKE ? OR 
        g.qr_token LIKE ? OR 
        g.source LIKE ? OR 
        g.contact_person LIKE ? OR 
        g.invitation_status LIKE ? OR 
        g.rsvp_status LIKE ? OR 
        g.notes LIKE ? OR 
        g.category LIKE ? OR
        e.name LIKE ?
      )`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term, term, term, term, term, term);
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
    const { event_id, name, phone, category, source, contact_person, invitation_status, rsvp_status, notes } = req.body;

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
      INSERT INTO guests (event_id, name, phone, category, qr_token, qr_image, attendance_status, source, contact_person, invitation_status, rsvp_status, notes)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      event_id,
      name.trim(),
      (phone || '').trim(),
      category || 'Pejabat TNI',
      qr_token,
      qr_image,
      (source || '').trim(),
      (contact_person || '').trim(),
      invitation_status || 'Belum Dikirim',
      rsvp_status || 'Belum Konfirmasi',
      (notes || '').trim()
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
    const { name, phone, category, attendance_status, source, contact_person, invitation_status, rsvp_status, notes } = req.body;

    const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(id);
    if (!guest) {
      return res.status(404).json({ error: 'Tamu tidak ditemukan.' });
    }

    let arrival_time = guest.arrival_time;
    if (attendance_status === 'PRESENT' && guest.attendance_status !== 'PRESENT') {
      arrival_time = getJakartaTimeString();
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
        arrival_time = ?,
        source = COALESCE(?, source),
        contact_person = COALESCE(?, contact_person),
        invitation_status = COALESCE(?, invitation_status),
        rsvp_status = COALESCE(?, rsvp_status),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : null,
      phone !== undefined ? phone.trim() : null,
      category !== undefined ? category : null,
      attendance_status !== undefined ? attendance_status : null,
      arrival_time,
      source !== undefined ? source.trim() : null,
      contact_person !== undefined ? contact_person.trim() : null,
      invitation_status !== undefined ? invitation_status : null,
      rsvp_status !== undefined ? rsvp_status : null,
      notes !== undefined ? notes.trim() : null,
      id
    );

    const updated = db.prepare(`
      SELECT g.*, e.name as event_name, e.date as event_date, e.location as event_location
      FROM guests g
      JOIN events e ON g.event_id = e.id
      WHERE g.id = ?
    `).get(id);

    logActivity(req, 'GUEST_UPDATED', `Memperbarui data tamu: ${currentGuest.name} (ID: #${id})`);
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

    logActivity(req, 'GUEST_DELETED', `Menghapus tamu: ${guest.name} (ID: #${id})`);
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
    const newArrival = newStatus === 'PRESENT' ? getJakartaTimeString() : null;

    db.prepare(`
      UPDATE guests
      SET attendance_status = ?, arrival_time = ?
      WHERE id = ?
    `).run(newStatus, newArrival, id);

    const updated = db.prepare(`
      SELECT g.*, e.name as event_name, e.location as event_location
      FROM guests g
      JOIN events e ON g.event_id = e.id
      WHERE g.id = ?
    `).get(id);

    if (newStatus === 'PRESENT' && updated) {
      try {
        liveController.broadcastCheckin({
          id: updated.id,
          name: updated.name,
          category: updated.category,
          event_id: updated.event_id,
          event_name: updated.event_name,
          event_location: updated.event_location,
          arrival_time: updated.arrival_time,
          formatted_arrival: (updated.arrival_time ? updated.arrival_time.split(' ')[1]?.substring(0, 5) : '') + ' WIB'
        });
      } catch (e) {
        console.error('Failed to broadcast toggle attendance:', e);
      }
    }

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

// Batch import guests for an event
exports.importGuests = async (req, res) => {
  try {
    const { event_id, guests } = req.body;

    if (!event_id) {
      return res.status(400).json({ error: 'Pilih acara tujuan untuk import data tamu.' });
    }

    if (!guests || !Array.isArray(guests) || guests.length === 0) {
      return res.status(400).json({ error: 'Data tamu tidak boleh kosong.' });
    }

    const event = db.prepare('SELECT id, name FROM events WHERE id = ?').get(event_id);
    if (!event) {
      return res.status(400).json({ error: 'Acara tidak ditemukan.' });
    }

    const processed = [];
    const validCategories = ['Pejabat TNI', 'Pejabat Luar', 'Sahabat Satsiber', 'VIP', 'General'];

    for (const item of guests) {
      const name = (item.name || '').trim();
      if (!name) continue;

      const phone = (item.phone || '').trim();
      let rawCat = (item.category || 'General').trim();
      let matchedCat = validCategories.find(c => c.toLowerCase() === rawCat.toLowerCase());
      const category = matchedCat || (rawCat ? rawCat : 'General');

      const source = (item.source || item.sumber || '').trim();
      const contact_person = (item.contact_person || item.cp || '').trim();
      const invitation_status = (item.invitation_status || 'Belum Dikirim').trim();
      const rsvp_status = (item.rsvp_status || 'Belum Konfirmasi').trim();
      const notes = (item.notes || item.keterangan || '').trim();

      let qr_token = generateUniqueToken();
      let duplicateCheck = db.prepare('SELECT id FROM guests WHERE qr_token = ?').get(qr_token);
      while (duplicateCheck) {
        qr_token = generateUniqueToken();
        duplicateCheck = db.prepare('SELECT id FROM guests WHERE qr_token = ?').get(qr_token);
      }

      const qr_image = await createQrImage(qr_token, req);
      processed.push({
        event_id,
        name,
        phone,
        category,
        source,
        contact_person,
        invitation_status,
        rsvp_status,
        notes,
        qr_token,
        qr_image
      });
    }

    if (processed.length === 0) {
      return res.status(400).json({ error: 'Tidak ada data tamu valid yang ditemukan untuk diimpor.' });
    }

    const insertMany = db.transaction((guestList) => {
      const stmt = db.prepare(`
        INSERT INTO guests (event_id, name, phone, category, source, contact_person, invitation_status, rsvp_status, notes, qr_token, qr_image, attendance_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      for (const g of guestList) {
        stmt.run(g.event_id, g.name, g.phone, g.category, g.source, g.contact_person, g.invitation_status, g.rsvp_status, g.notes, g.qr_token, g.qr_image);
      }
    });

    insertMany(processed);

    return res.status(201).json({
      success: true,
      count: processed.length,
      message: `Berhasil mengimpor ${processed.length} data tamu ke acara "${event.name}".`
    });
  } catch (error) {
    console.error('Import guests error:', error);
    return res.status(500).json({ error: 'Gagal mengimpor data tamu: ' + error.message });
  }
};

// Export guests list as CSV
exports.exportGuestsCsv = (req, res) => {
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
      query += ` AND (
        g.name LIKE ? OR 
        g.phone LIKE ? OR 
        g.qr_token LIKE ? OR 
        g.source LIKE ? OR 
        g.contact_person LIKE ? OR 
        g.invitation_status LIKE ? OR 
        g.rsvp_status LIKE ? OR 
        g.notes LIKE ? OR 
        g.category LIKE ? OR
        e.name LIKE ?
      )`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term, term, term, term, term, term, term);
    }

    query += ` ORDER BY g.created_at DESC`;

    const guests = db.prepare(query).all(...params);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      'No',
      'Nama Tamu',
      'Kategori',
      'Sumber',
      'Contact Person',
      'Nomor HP',
      'Status Undangan',
      'Konfirmasi Kehadiran',
      'Status Kehadiran Scan',
      'Keterangan',
      'Acara',
      'Waktu Kedatangan',
      'Token QR',
      'Link Undangan Digital'
    ];

    const rows = [headers.join(',')];

    guests.forEach((g, idx) => {
      const inviteUrl = `${baseUrl}/check/${g.qr_token}`;
      const statusLabel = g.attendance_status === 'PRESENT' ? 'Hadir (PRESENT)' : 'Belum Hadir (PENDING)';
      const row = [
        escapeCsv(idx + 1),
        escapeCsv(g.name),
        escapeCsv(g.category || 'General'),
        escapeCsv(g.source || '-'),
        escapeCsv(g.contact_person || '-'),
        escapeCsv(g.phone || '-'),
        escapeCsv(g.invitation_status || 'Belum Dikirim'),
        escapeCsv(g.rsvp_status || 'Belum Konfirmasi'),
        escapeCsv(statusLabel),
        escapeCsv(g.notes || '-'),
        escapeCsv(g.event_name),
        escapeCsv(g.arrival_time || '-'),
        escapeCsv(g.qr_token),
        escapeCsv(inviteUrl)
      ];
      rows.push(row.join(','));
    });

    const csvContent = '\uFEFF' + rows.join('\r\n');
    let eventNamePart = 'Semua_Acara';
    if (event_id && event_id !== 'all' && guests.length > 0) {
      eventNamePart = guests[0].event_name.replace(/[^a-zA-Z0-9_-]/g, '_');
    }
    const fileName = `Daftar_Tamu_${eventNamePart}_${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error('Export CSV error:', error);
    return res.status(500).json({ error: 'Gagal mengekspor data tamu.' });
  }
};

// Download all QR codes for an event in a ZIP archive
exports.downloadEventQrsZip = async (req, res) => {
  try {
    const eventId = req.params.id || req.query.event_id;
    if (!eventId || eventId === 'all') {
      return res.status(400).json({ error: 'Pilih acara tertentu untuk mengunduh QR Code.' });
    }

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Acara tidak ditemukan.' });
    }

    const guests = db.prepare('SELECT * FROM guests WHERE event_id = ? ORDER BY name ASC').all(eventId);
    if (!guests || guests.length === 0) {
      return res.status(400).json({ error: `Belum ada tamu terdaftar pada acara "${event.name}".` });
    }

    const zip = new JSZip();
    const safeEventName = event.name.replace(/[/\\?%*:|"<>]/g, '').trim().replace(/\s+/g, '_');
    const folder = zip.folder(`QR_${safeEventName}`);

    // Summary CSV inside zip
    const csvLines = ['No,Nama Tamu,Nomor HP,Kategori,Token,Status,File Gambar QR'];

    for (let i = 0; i < guests.length; i++) {
      const g = guests[i];
      const qrFileName = `qr_${g.qr_token}.png`;
      let qrFilePath = path.join(qrDir, qrFileName);

      // If missing on disk, regenerate
      if (!fs.existsSync(qrFilePath)) {
        await createQrImage(g.qr_token, req);
      }

      if (fs.existsSync(qrFilePath)) {
        const fileData = fs.readFileSync(qrFilePath);
        const cleanGuestName = g.name.replace(/[/\\?%*:|"<>]/g, '').trim().replace(/\s+/g, '_');
        const zipImageName = `${g.category}_${cleanGuestName}_${g.qr_token}.png`;
        folder.file(zipImageName, fileData);

        csvLines.push(`"${i + 1}","${g.name.replace(/"/g, '""')}","${(g.phone || '').replace(/"/g, '""')}","${g.category}","${g.qr_token}","${g.attendance_status}","${zipImageName}"`);
      }
    }

    folder.file('DAFTAR_TAMU_ACARA.csv', '\uFEFF' + csvLines.join('\r\n'));

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const downloadFileName = `QR_Codes_${safeEventName}_${Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFileName}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    return res.send(zipBuffer);
  } catch (error) {
    console.error('Download QR zip error:', error);
    return res.status(500).json({ error: 'Gagal membuat file zip QR code: ' + error.message });
  }
};

// Restore full backup JSON (Events & Guests preservation)
exports.restoreFullBackup = async (req, res) => {
  try {
    const { events, guests } = req.body;
    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Format backup tidak valid: events harus berupa array.' });
    }

    const eventIdMap = {};
    const insertEvent = db.prepare(`
      INSERT INTO events (name, date, location, description)
      VALUES (?, ?, ?, ?)
    `);

    for (const ev of events) {
      let existing = db.prepare('SELECT id FROM events WHERE name = ?').get(ev.name);
      let targetId = existing ? existing.id : null;
      if (!targetId) {
        const result = insertEvent.run(ev.name, ev.date, ev.location, ev.description || '');
        targetId = result.lastInsertRowid;
      }
      if (ev.id) {
        eventIdMap[ev.id] = targetId;
      }
    }

    let restoredGuestsCount = 0;
    if (guests && Array.isArray(guests)) {
      const insertGuest = db.prepare(`
        INSERT INTO guests (event_id, name, phone, category, qr_token, qr_image, attendance_status, arrival_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const g of guests) {
        let targetEventId = eventIdMap[g.event_id];
        if (!targetEventId && g.event_name) {
          const ev = db.prepare('SELECT id FROM events WHERE name = ?').get(g.event_name);
          if (ev) targetEventId = ev.id;
        }
        if (!targetEventId) {
          const firstEv = db.prepare('SELECT id FROM events LIMIT 1').get();
          targetEventId = firstEv ? firstEv.id : 1;
        }

        const token = g.qr_token || generateUniqueToken();
        const existingGuest = db.prepare('SELECT id FROM guests WHERE qr_token = ?').get(token);
        if (existingGuest) continue;

        const qrFileName = `qr_${token}.png`;
        const qrFilePath = path.join(qrDir, qrFileName);
        let qr_image = `/qr/${qrFileName}`;
        if (!fs.existsSync(qrFilePath)) {
          await createQrImage(token, req);
        }

        insertGuest.run(
          targetEventId,
          g.name,
          g.phone || '',
          g.category || 'General',
          token,
          qr_image,
          g.attendance_status || 'PENDING',
          g.arrival_time || null
        );
        restoredGuestsCount++;
      }
    }

    return res.json({
      success: true,
      message: `Berhasil me-restore ${events.length} acara dan ${restoredGuestsCount} tamu dari file backup!`
    });
  } catch (error) {
    console.error('Restore backup error:', error);
    return res.status(500).json({ error: 'Gagal me-restore backup: ' + error.message });
  }
};

exports.downloadGuestInvitationPdf = async (req, res) => {
  try {
    const { id } = req.params;
    const guest = db.prepare('SELECT g.*, e.name as event_name FROM guests g JOIN events e ON g.event_id = e.id WHERE g.id = ?').get(id);
    if (!guest) {
      return res.status(404).json({ error: 'Tamu tidak ditemukan.' });
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const checkUrl = protocol + '://' + host + '/check/' + guest.qr_token;

    const pdfBuffer = await generateInvitationPdf(guest, checkUrl);

    const safeName = guest.name.replace(/[/\\\\?%*:|"<>]/g, '').trim().replace(/\\s+/g, '_');
    const filename = 'Undangan_' + safeName + '_' + guest.qr_token + '.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Download guest invitation error:', error);
    return res.status(500).json({ error: 'Gagal membuat file PDF undangan: ' + error.message });
  }
};

exports.downloadGuestInvitationPdfByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const guest = db.prepare('SELECT g.*, e.name as event_name FROM guests g JOIN events e ON g.event_id = e.id WHERE g.qr_token = ?').get(token);
    if (!guest) {
      return res.status(404).json({ error: 'Undangan tidak ditemukan.' });
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const checkUrl = protocol + '://' + host + '/check/' + guest.qr_token;

    const pdfBuffer = await generateInvitationPdf(guest, checkUrl);

    const safeName = guest.name.replace(/[/\\\\?%*:|"<>]/g, '').trim().replace(/\\s+/g, '_');
    const filename = 'Undangan_' + safeName + '_' + guest.qr_token + '.pdf';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Download guest invitation by token error:', error);
    return res.status(500).json({ error: 'Gagal membuat file PDF undangan: ' + error.message });
  }
};

exports.downloadEventInvitationsZip = async (req, res) => {
  try {
    let eventId = req.params.id || req.query.event_id;
    let event = null;
    let guests = [];

    if (!eventId || eventId === 'all') {
      // Jika event_id all atau tidak dispesifikasikan, ambil acara pertama yang ada tamu
      const firstEventWithGuests = db.prepare('SELECT e.*, COUNT(g.id) as cnt FROM events e JOIN guests g ON e.id = g.event_id GROUP BY e.id ORDER BY cnt DESC LIMIT 1').get();
      if (firstEventWithGuests) {
        event = firstEventWithGuests;
        eventId = event.id;
        guests = db.prepare('SELECT * FROM guests WHERE event_id = ? ORDER BY name ASC').all(eventId);
      } else {
        // Ambil semua tamu dari semua acara
        guests = db.prepare('SELECT * FROM guests ORDER BY name ASC').all();
        event = { name: 'Semua_Acara' };
      }
    } else {
      event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Acara tidak ditemukan.' });
      }
      guests = db.prepare('SELECT * FROM guests WHERE event_id = ? ORDER BY name ASC').all(eventId);
    }

    if (!guests || guests.length === 0) {
      return res.status(400).json({ error: 'Belum ada tamu yang terdaftar di sistem.' });
    }

    const zip = new JSZip();
    const safeEventName = event.name.replace(/[/\\\\?%*:|"<>]/g, '').trim().replace(/\\s+/g, '_');
    const folder = zip.folder('Undangan_' + safeEventName);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';

    for (let i = 0; i < guests.length; i++) {
      const g = guests[i];
      const checkUrl = protocol + '://' + host + '/check/' + g.qr_token;
      const pdfBuffer = await generateInvitationPdf(g, checkUrl);
      const cleanGuestName = g.name.replace(/[/\\\\?%*:|"<>]/g, '').trim().replace(/\\s+/g, '_');
      const pdfFileName = 'Undangan_' + g.category + '_' + cleanGuestName + '_' + g.qr_token + '.pdf';
      folder.file(pdfFileName, pdfBuffer);
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    const downloadFileName = 'Undangan_Lengkap_' + safeEventName + '_' + Date.now() + '.zip';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="' + downloadFileName + '"');
    res.setHeader('Content-Length', zipBuffer.length);
    return res.send(zipBuffer);
  } catch (error) {
    console.error('Download invitations zip error:', error);
    return res.status(500).json({ error: 'Gagal membuat file ZIP undangan: ' + error.message });
  }
};
