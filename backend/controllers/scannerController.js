const db = require('../database/db');
const liveController = require('./liveController');

// Helper to get formatted date string in Asia/Jakarta (WIB) timezone: "YYYY-MM-DD HH:mm:ss"
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

// Helper to format time into "HH:MM WIB" accurately in Asia/Jakarta
function formatWib(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[1].substring(0, 5)} WIB`;
    }
    const d = new Date(dateStr.replace(' ', 'T'));
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes} WIB`;
  } catch (e) {
    return dateStr;
  }
}

// Extract raw token if full URL is passed
function extractToken(raw) {
  if (!raw) return '';
  const str = raw.trim();
  if (str.includes('/check/')) {
    const parts = str.split('/check/');
    return parts[parts.length - 1].split('?')[0].split('#')[0].trim();
  }
  return str;
}

exports.checkAndRecordAttendance = (req, res) => {
  try {
    const rawToken = req.params?.token || req.query?.token || req.body?.token;
    const token = extractToken(rawToken);

    if (!token) {
      return res.status(400).json({
        valid: false,
        message: 'Token QR tidak valid atau kosong'
      });
    }

    // Optional event_id filter if usher locked into specific event
    const eventId = req.query?.event_id || req.body?.event_id;

    let query = `
      SELECT 
        g.*,
        e.id as event_id,
        e.name as event_name,
        e.date as event_date,
        e.location as event_location
      FROM guests g
      JOIN events e ON g.event_id = e.id
      WHERE g.qr_token = ?
    `;
    const params = [token];

    if (eventId && eventId !== 'all') {
      query += ` AND g.event_id = ?`;
      params.push(eventId);
    }

    const guest = db.prepare(query).get(...params);

    if (!guest) {
      return res.status(404).json({
        valid: false,
        message: 'Undangan tidak ditemukan'
      });
    }

    // Check if already checked in
    if (guest.attendance_status === 'PRESENT') {
      return res.json({
        valid: true,
        already_checked_in: true,
        guest: guest.name,
        event: guest.event_name,
        category: guest.category,
        arrival_time: guest.arrival_time,
        formatted_arrival: formatWib(guest.arrival_time),
        message: 'TAMU SUDAH HADIR'
      });
    }

    // Record attendance now in Jakarta WIB timezone
    const nowLocal = getJakartaTimeString();
    db.prepare(`
      UPDATE guests 
      SET attendance_status = 'PRESENT', arrival_time = ?
      WHERE id = ?
    `).run(nowLocal, guest.id);

    // Broadcast checkin event to live TV display screens in real-time
    try {
      liveController.broadcastCheckin({
        id: guest.id,
        name: guest.name,
        category: guest.category,
        event_id: guest.event_id,
        event_name: guest.event_name,
        event_location: guest.event_location,
        arrival_time: nowLocal,
        formatted_arrival: formatWib(nowLocal)
      });
    } catch (e) {
      console.error('Failed to broadcast live checkin:', e);
    }

    return res.json({
      valid: true,
      already_checked_in: false,
      guest: guest.name,
      event: guest.event_name,
      category: guest.category,
      arrival_time: nowLocal,
      formatted_arrival: formatWib(nowLocal),
      message: 'Kehadiran Berhasil Dicatat'
    });
  } catch (error) {
    console.error('Scan check error:', error);
    return res.status(500).json({
      valid: false,
      error: 'Terjadi kesalahan pada sistem saat memvalidasi QR.'
    });
  }
};

exports.getGuestInvitePublic = (req, res) => {
  try {
    const rawToken = req.params.token;
    const token = extractToken(rawToken);

    const guest = db.prepare(`
      SELECT 
        g.id,
        g.name,
        g.phone,
        g.category,
        g.qr_token,
        g.qr_image,
        g.attendance_status,
        g.arrival_time,
        e.id as event_id,
        e.name as event_name,
        e.date as event_date,
        e.location as event_location,
        e.description as event_description
      FROM guests g
      JOIN events e ON g.event_id = e.id
      WHERE g.qr_token = ?
    `).get(token);

    if (!guest) {
      return res.status(404).json({ error: 'Undangan tidak ditemukan.' });
    }

    return res.json({
      success: true,
      invitation: {
        ...guest,
        formatted_arrival: formatWib(guest.arrival_time)
      }
    });
  } catch (error) {
    console.error('Get public invite error:', error);
    return res.status(500).json({ error: 'Gagal memuat data undangan.' });
  }
};

exports.getStats = (req, res) => {
  try {
    const { event_id } = req.query;

    let filter = '';
    const params = [];
    if (event_id && event_id !== 'all') {
      filter = ' WHERE event_id = ? ';
      params.push(event_id);
    }

    const totalGuests = db.prepare(`SELECT COUNT(*) as count FROM guests ${filter}`).get(...params).count;
    const confirmedAttendance = db.prepare(`SELECT COUNT(*) as count FROM guests ${filter ? filter + ' AND' : ' WHERE'} attendance_status = 'PRESENT'`).get(...params).count;
    const notArrived = Math.max(0, totalGuests - confirmedAttendance);
    const todayJakarta = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    const todayAttendance = db.prepare(`SELECT COUNT(*) as count FROM guests ${filter ? filter + ' AND' : ' WHERE'} attendance_status = 'PRESENT' AND date(arrival_time) = ?`).get(...params, todayJakarta).count;

    // Category breakdown
    const categoryStats = db.prepare(`
      SELECT category, COUNT(*) as count,
        SUM(CASE WHEN attendance_status = 'PRESENT' THEN 1 ELSE 0 END) as present_count
      FROM guests
      ${filter}
      GROUP BY category
    `).all(...params);

    // Event summary
    const eventStats = db.prepare(`
      SELECT e.id, e.name, e.date,
        COUNT(g.id) as total,
        SUM(CASE WHEN g.attendance_status = 'PRESENT' THEN 1 ELSE 0 END) as present
      FROM events e
      LEFT JOIN guests g ON e.id = g.event_id
      GROUP BY e.id
    `).all();

    return res.json({
      success: true,
      stats: {
        total_guests: totalGuests,
        confirmed_attendance: confirmedAttendance,
        not_arrived: notArrived,
        today_attendance: todayAttendance,
        categories: categoryStats,
        events: eventStats
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    return res.status(500).json({ error: 'Gagal mengambil data statistik.' });
  }
};
