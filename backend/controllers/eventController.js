const db = require('../database/db');

exports.getAllEvents = (req, res) => {
  try {
    const todayJakarta = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    const events = db.prepare(`
      SELECT 
        e.*,
        COUNT(g.id) as total_guests,
        SUM(CASE WHEN g.attendance_status = 'PRESENT' THEN 1 ELSE 0 END) as confirmed_attendance,
        SUM(CASE WHEN g.id IS NOT NULL AND (g.attendance_status != 'PRESENT' OR g.attendance_status IS NULL) THEN 1 ELSE 0 END) as not_arrived,
        SUM(CASE WHEN g.attendance_status = 'PRESENT' AND date(g.arrival_time) = ? THEN 1 ELSE 0 END) as today_attendance
      FROM events e
      LEFT JOIN guests g ON e.id = g.event_id
      GROUP BY e.id
      ORDER BY e.created_at DESC
    `).all(todayJakarta);

    return res.json({ success: true, events });
  } catch (error) {
    console.error('Get all events error:', error);
    return res.status(500).json({ error: 'Gagal mengambil data event.' });
  }
};

exports.getEventById = (req, res) => {
  try {
    const { id } = req.params;
    const event = db.prepare(`
      SELECT 
        e.*,
        COUNT(g.id) as total_guests,
        SUM(CASE WHEN g.attendance_status = 'PRESENT' THEN 1 ELSE 0 END) as confirmed_attendance,
        SUM(CASE WHEN g.id IS NOT NULL AND (g.attendance_status != 'PRESENT' OR g.attendance_status IS NULL) THEN 1 ELSE 0 END) as not_arrived
      FROM events e
      LEFT JOIN guests g ON e.id = g.event_id
      WHERE e.id = ?
      GROUP BY e.id
    `).get(id);

    if (!event) {
      return res.status(404).json({ error: 'Event tidak ditemukan.' });
    }

    return res.json({ success: true, event });
  } catch (error) {
    console.error('Get event by id error:', error);
    return res.status(500).json({ error: 'Gagal mengambil data event.' });
  }
};

exports.createEvent = (req, res) => {
  try {
    const { name, date, location, description } = req.body;

    if (!name || !date || !location) {
      return res.status(400).json({ error: 'Nama acara, tanggal, dan lokasi wajib diisi.' });
    }

    const stmt = db.prepare(`
      INSERT INTO events (name, date, location, description)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(name.trim(), date.trim(), location.trim(), (description || '').trim());

    const createdEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);

    return res.status(201).json({
      success: true,
      message: 'Event berhasil dibuat.',
      event: createdEvent
    });
  } catch (error) {
    console.error('Create event error:', error);
    return res.status(500).json({ error: 'Gagal menambahkan event baru.' });
  }
};

exports.updateEvent = (req, res) => {
  try {
    const { id } = req.params;
    const { name, date, location, description } = req.body;

    if (!name || !date || !location) {
      return res.status(400).json({ error: 'Nama acara, tanggal, dan lokasi wajib diisi.' });
    }

    const existing = db.prepare('SELECT id FROM events WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Event tidak ditemukan.' });
    }

    db.prepare(`
      UPDATE events
      SET name = ?, date = ?, location = ?, description = ?
      WHERE id = ?
    `).run(name.trim(), date.trim(), location.trim(), (description || '').trim(), id);

    const updatedEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(id);

    return res.json({
      success: true,
      message: 'Event berhasil diperbarui.',
      event: updatedEvent
    });
  } catch (error) {
    console.error('Update event error:', error);
    return res.status(500).json({ error: 'Gagal memperbarui event.' });
  }
};

exports.deleteEvent = (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT id FROM events WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Event tidak ditemukan.' });
    }

    db.prepare('DELETE FROM events WHERE id = ?').run(id);

    return res.json({
      success: true,
      message: 'Event dan tamu terkait berhasil dihapus.'
    });
  } catch (error) {
    console.error('Delete event error:', error);
    return res.status(500).json({ error: 'Gagal menghapus event.' });
  }
};
