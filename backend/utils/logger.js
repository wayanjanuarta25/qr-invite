const db = require('../database/db');

function logActivity(req, action, details = '') {
  try {
    const user = req.user || {};
    const userId = user.id || null;
    const userName = user.name || (req.body && req.body.email ? req.body.email : 'Anonymous');
    const userEmail = user.email || (req.body && req.body.email ? req.body.email : '-');

    const headers = req.headers || {};
    const socket = req.socket || {};
    const ip = headers['x-forwarded-for'] || socket.remoteAddress || req.ip || '-';
    const userAgent = headers['user-agent'] || '-';

    const stmt = db.prepare(`
      INSERT INTO activity_logs (user_id, user_name, user_email, action, details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(userId, userName, userEmail, action, typeof details === 'object' ? JSON.stringify(details) : String(details), ip, userAgent);
  } catch (err) {
    console.error('Failed to write activity log:', err);
  }
}

module.exports = {
  logActivity
};
