const db = require('../database/db');

// In-memory set of SSE client connections
const clients = new Set();

// Recent check-in events buffer
const recentCheckins = [];

// Helper to broadcast check-in event to all connected TV screens
function broadcastCheckin(guestData) {
  recentCheckins.unshift(guestData);
  if (recentCheckins.length > 50) recentCheckins.pop();

  const payload = JSON.stringify({
    type: 'checkin',
    data: guestData,
    timestamp: Date.now()
  });

  for (const client of clients) {
    if (!client.eventId || client.eventId === 'all' || String(client.eventId) === String(guestData.event_id)) {
      try {
        client.res.write(`data: ${payload}\n\n`);
      } catch (err) {
        clients.delete(client);
      }
    }
  }
}

// SSE Stream Endpoint for Realtime TV Display
exports.sseStream = (req, res) => {
  const eventId = req.query.event_id || 'all';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Live TV Stream Connected', event_id: eventId })}\n\n`);

  const client = { id: Date.now() + Math.random(), res, eventId };
  clients.add(client);

  // Send keep-alive comment every 20s to prevent reverse-proxy timeouts
  const keepAliveInterval = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (e) {
      clearInterval(keepAliveInterval);
      clients.delete(client);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAliveInterval);
    clients.delete(client);
  });
};

// Fallback & Initial State Endpoint for TV Display
exports.getLiveDisplayData = (req, res) => {
  try {
    const { event_id } = req.query;

    let eventInfo = null;
    if (event_id && event_id !== 'all') {
      eventInfo = db.prepare('SELECT * FROM events WHERE id = ?').get(event_id);
    } else {
      // Get the latest active event
      eventInfo = db.prepare('SELECT * FROM events ORDER BY date DESC LIMIT 1').get() || null;
    }

    // Query attendees for the display
    let attendeeQuery = `
      SELECT 
        g.id, 
        g.name, 
        g.category, 
        g.arrival_time, 
        g.event_id, 
        e.name as event_name, 
        e.location as event_location, 
        e.date as event_date
      FROM guests g
      JOIN events e ON g.event_id = e.id
      WHERE g.attendance_status = 'PRESENT'
    `;
    const params = [];

    if (event_id && event_id !== 'all') {
      attendeeQuery += ` AND g.event_id = ?`;
      params.push(event_id);
    }

    attendeeQuery += ` ORDER BY g.arrival_time DESC LIMIT 20`;
    const recentAttendees = db.prepare(attendeeQuery).all(...params);

    // Count statistics
    let statsQuery = `
      SELECT 
        COUNT(id) as total_guests,
        SUM(CASE WHEN attendance_status = 'PRESENT' THEN 1 ELSE 0 END) as total_present
      FROM guests
    `;
    const statsParams = [];
    if (event_id && event_id !== 'all') {
      statsQuery += ` WHERE event_id = ?`;
      statsParams.push(event_id);
    }
    const stats = db.prepare(statsQuery).get(...statsParams) || { total_guests: 0, total_present: 0 };

    return res.json({
      success: true,
      event: eventInfo,
      stats: {
        total_guests: stats.total_guests || 0,
        total_present: stats.total_present || 0
      },
      recent_attendees: recentAttendees
    });
  } catch (err) {
    console.error('Get live display data error:', err);
    return res.status(500).json({ error: 'Gagal mengambil data live display.' });
  }
};

exports.broadcastCheckin = broadcastCheckin;
