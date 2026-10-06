const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');

const dbPath = path.join(__dirname, 'database.sqlite');
const schemaPath = path.join(__dirname, 'schema.sql');
const seedDataPath = path.join(__dirname, 'seed_data.json');
const qrDir = path.join(__dirname, '..', '..', 'qr');

if (!fs.existsSync(qrDir)) {
  fs.mkdirSync(qrDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

// Auto-migration for legacy databases to modern features
function autoMigrate() {
  try {
    // 1. Check and add missing columns to 'guests' table
    const guestCols = db.prepare('PRAGMA table_info(guests)').all().map(c => c.name);
    const requiredGuestCols = [
      { name: 'source', def: "TEXT DEFAULT ''" },
      { name: 'contact_person', def: "TEXT DEFAULT ''" },
      { name: 'invitation_status', def: "TEXT DEFAULT 'Belum Dikirim'" },
      { name: 'rsvp_status', def: "TEXT DEFAULT 'Belum Konfirmasi'" },
      { name: 'notes', def: "TEXT DEFAULT ''" },
      { name: 'updated_at', def: "DATETIME" }
    ];

    for (const col of requiredGuestCols) {
      if (!guestCols.includes(col.name)) {
        db.exec(`ALTER TABLE guests ADD COLUMN ${col.name} ${col.def}`);
        console.log(`[DB MIGRATION] Added '${col.name}' column to 'guests' table.`);
      }
    }

    // 2. Check and add missing columns to 'users' table
    const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    const requiredUserCols = [
      { name: 'role', def: "TEXT DEFAULT 'Admin'" },
      { name: 'status', def: "TEXT DEFAULT 'ACTIVE'" }
    ];

    for (const col of requiredUserCols) {
      if (!userCols.includes(col.name)) {
        db.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.def}`);
        console.log(`[DB MIGRATION] Added '${col.name}' column to 'users' table.`);
      }
    }

    // Set default values for any legacy null/empty fields
    db.exec("UPDATE guests SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = ''");
    db.exec("UPDATE users SET role = 'Admin' WHERE role IS NULL OR role = ''");
    db.exec("UPDATE users SET status = 'ACTIVE' WHERE status IS NULL OR status = ''");

    // 3. Ensure 'activity_logs' table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT,
        user_email TEXT,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_logs_user_id ON activity_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_logs_action ON activity_logs(action);
      CREATE INDEX IF NOT EXISTS idx_logs_created_at ON activity_logs(created_at);
    `);
  } catch (err) {
    console.error('[DB MIGRATION ERROR]', err);
  }
}

autoMigrate();

// Seed default data & sync master guests from seed_data.json
async function initSeed() {
  try {
    // 1. Ensure seed_data.json is synced into events & guests
    if (fs.existsSync(seedDataPath)) {
      const raw = fs.readFileSync(seedDataPath, 'utf8');
      const data = JSON.parse(raw);

      // Upsert / Insert events from seed_data
      const insertEvent = db.prepare(`
        INSERT INTO events (id, name, date, location, description)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const ev of (data.events || [])) {
        const exist = db.prepare('SELECT id FROM events WHERE name = ? OR id = ?').get(ev.name, ev.id);
        if (!exist) {
          insertEvent.run(ev.id, ev.name, ev.date, ev.location, ev.description || '');
          console.log(`[DB SYNC] Created event: "${ev.name}" (ID: ${ev.id})`);
        }
      }

      // Check current guest count for master event (e.g. HUT KE-9 SATSIBER TNI)
      const hutEvent = db.prepare("SELECT id FROM events WHERE name = 'HUT KE-9 SATSIBER TNI'").get();
      const targetEventId = hutEvent ? hutEvent.id : (data.events?.[0]?.id || 1);

      // Insert missing master guests by qr_token or name
      const checkGuest = db.prepare('SELECT id FROM guests WHERE qr_token = ? OR (name = ? AND event_id = ?)');
      const insertGuest = db.prepare(`
        INSERT INTO guests (
          event_id, name, phone, category, qr_token, qr_image, attendance_status,
          arrival_time, created_at, updated_at, source, contact_person, invitation_status, rsvp_status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let insertedCount = 0;
      for (const g of (data.guests || [])) {
        const exist = checkGuest.get(g.qr_token, g.name, targetEventId);
        if (!exist) {
          const qrFileName = `qr_${g.qr_token}.png`;
          const qrFilePath = path.join(qrDir, qrFileName);

          if (!fs.existsSync(qrFilePath)) {
            try {
              await QRCode.toFile(qrFilePath, `http://localhost:3000/check/${g.qr_token}`, {
                errorCorrectionLevel: 'H',
                margin: 2,
                width: 350,
                color: { dark: '#0F172A', light: '#FFFFFF' }
              });
            } catch (qrErr) {
              // ignore
            }
          }

          insertGuest.run(
            targetEventId,
            g.name,
            g.phone || '',
            g.category || 'General',
            g.qr_token,
            g.qr_image || `/qr/${qrFileName}`,
            g.attendance_status || 'PENDING',
            g.arrival_time || null,
            g.created_at || new Date().toISOString(),
            g.updated_at || g.created_at || new Date().toISOString(),
            g.source || '',
            g.contact_person || '',
            g.invitation_status || 'Belum Dikirim',
            g.rsvp_status || 'Belum Konfirmasi',
            g.notes || ''
          );
          insertedCount++;
        }
      }

      if (insertedCount > 0) {
        console.log(`[DB SYNC] Successfully synced ${insertedCount} new guests from seed_data.json!`);
      }
    }

    // 2. Ensure default Administrator user exists
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount === 0) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      db.prepare(`
        INSERT INTO users (name, email, password, role, status)
        VALUES (?, ?, ?, 'Admin', 'ACTIVE')
      `).run('Administrator', 'admin@digitalinvite.com', hashedPassword);
      console.log('[DB SYNC] Created default Administrator user.');
    }
  } catch (err) {
    console.error('[DB SYNC ERROR]', err);
  }
}

initSeed().catch(console.error);

module.exports = db;
