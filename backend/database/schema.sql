-- Database Schema for Digital Invitation Management System

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'Admin',
    status TEXT DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    location TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    category TEXT DEFAULT 'General',
    qr_token TEXT UNIQUE NOT NULL,
    qr_image TEXT,
    attendance_status TEXT DEFAULT 'PENDING',
    arrival_time DATETIME,
    source TEXT DEFAULT '',
    contact_person TEXT DEFAULT '',
    invitation_status TEXT DEFAULT 'Belum Dikirim',
    rsvp_status TEXT DEFAULT 'Belum Konfirmasi',
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

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

CREATE INDEX IF NOT EXISTS idx_guests_event_id ON guests(event_id);
CREATE INDEX IF NOT EXISTS idx_guests_qr_token ON guests(qr_token);
CREATE INDEX IF NOT EXISTS idx_guests_status ON guests(attendance_status);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON activity_logs(created_at);
