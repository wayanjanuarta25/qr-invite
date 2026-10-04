const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');

const dbPath = path.join(__dirname, 'database.sqlite');
const schemaPath = path.join(__dirname, 'schema.sql');
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

// Seed default data if users table is empty
async function initSeed() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    console.log('Seeding default administrator and sample events...');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    const insertUser = db.prepare(`
      INSERT INTO users (name, email, password)
      VALUES (?, ?, ?)
    `);
    insertUser.run('Administrator', 'admin@digitalinvite.com', hashedPassword);

    // Insert sample events
    const insertEvent = db.prepare(`
      INSERT INTO events (name, date, location, description)
      VALUES (?, ?, ?, ?)
    `);

    const event1 = insertEvent.run(
      'Wedding Ahmad & Siti',
      '2026-11-20 09:00',
      'Grand Ballroom Mulia Hotel, Jakarta',
      'The Wedding Celebration of Ahmad & Siti'
    );

    const event2 = insertEvent.run(
      'Company Gathering 2027',
      '2027-01-15 13:00',
      'Royal Tulip Gunung Geulis, Bogor',
      'Annual Gala & Synergy Gathering'
    );

    const event3 = insertEvent.run(
      'National Seminar on AI',
      '2026-12-05 08:30',
      'Jakarta Convention Center',
      'Transforming Digital Economy with Artificial Intelligence'
    );

    // Insert sample guests for Event 1
    const sampleGuests = [
      { name: 'Budi Santoso', phone: '081234567890', category: 'VIP', status: 'PENDING', arrival: null },
      { name: 'Dian Sastrowardoyo', phone: '081298765432', category: 'VIP', status: 'PENDING', arrival: null },
      { name: 'Rahmat Hidayat', phone: '081311223344', category: 'Family', status: 'PENDING', arrival: null },
      { name: 'Nurul Indah', phone: '081555667788', category: 'Family', status: 'PENDING', arrival: null },
      { name: 'Eko Prasetyo', phone: '085712345678', category: 'Friend', status: 'PENDING', arrival: null },
      { name: 'Siti Sarah', phone: '087812349999', category: 'Friend', status: 'PENDING', arrival: null },
      { name: 'Andi Wijaya', phone: '081900112233', category: 'General', status: 'PENDING', arrival: null },
      { name: 'Maya Anggraini', phone: '081700998877', category: 'General', status: 'PRESENT', arrival: '2026-10-02 10:24:00' }
    ];

    const insertGuest = db.prepare(`
      INSERT INTO guests (event_id, name, phone, category, qr_token, qr_image, attendance_status, arrival_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const g of sampleGuests) {
      const qrToken = Math.random().toString(36).substring(2, 8).toUpperCase() + 
                      Math.random().toString(36).substring(2, 8).toUpperCase();
      const qrFileName = `qr_${qrToken}.png`;
      const qrFilePath = path.join(qrDir, qrFileName);

      try {
        // Generate QR code pointing to check/token
        await QRCode.toFile(qrFilePath, `http://localhost:3000/check/${qrToken}`, {
          errorCorrectionLevel: 'H',
          margin: 2,
          width: 350,
          color: {
            dark: '#0F172A',
            light: '#FFFFFF'
          }
        });

        insertGuest.run(
          event1.lastInsertRowid,
          g.name,
          g.phone,
          g.category,
          qrToken,
          `/qr/${qrFileName}`,
          g.status,
          g.arrival
        );
      } catch (err) {
        console.error('Failed to generate initial QR for guest:', g.name, err);
      }
    }

    console.log('Seed completed successfully!');
  }
}

initSeed().catch(err => {
  console.error('Database seed error:', err);
});

module.exports = db;
