# Digital Invitation Management System with QR Code Attendance

Sistem Manajemen Undangan Digital Multi-Acara modern dan berkinerja tinggi dengan sistem presensi kehadiran berbasis QR Code. Dirancang secara khusus untuk kebutuhan pernikahan (*wedding*), seminar nasional, gathering korporat, dan acara privat (*private events*).

---

## 🚀 Fitur Utama

- **Multi-Event Management**: Satu akun admin dapat mengelola banyak acara sekaligus (contoh: *Wedding Ahmad & Siti*, *Company Gathering 2027*, *National Seminar*).
- **Dashboard Statistik Real-time**: 
  - Total Guests
  - Confirmed Attendance (Hadir)
  - Not Arrived (Belum Hadir)
  - Today's Attendance (Check-in Hari Ini)
  - Grafik Rasio Kehadiran (Donut Chart) & Distribusi Kategori (Bar Chart)
- **Manajemen Tamu Lengkap**:
  - Filter berdasarkan Acara, Kategori (VIP, Family, Friend, General), dan Status Kehadiran
  - Pencarian tamu instan berdasarkan nama, no HP, atau token QR
  - **Sistem Pagination Cerdas**: Navigasi halaman cepat dengan pilihan jumlah baris (10, 25, 50, 100 per halaman).
  - Tambah, edit, dan hapus tamu
  - Toggle status kehadiran manual
  - **Import Data Tamu Masal**: Upload file Excel (`.xlsx`, `.xls`) atau `.csv`, deteksi kolom otomatis, pratinjau live sebelum impor, dan auto-generate QR code untuk seluruh tamu baru.
  - **Template Import Siap Pakai**: Unduh template Excel atau CSV dengan satu klik.
  - **Export Data Tamu**: Unduh data tamu terfilter ke dalam format Excel (`.xlsx`) rapi atau CSV (`.csv`) universal lengkap dengan link tiket undangan dan token.
  - **Download Seluruh QR Code Acara (ZIP Archive)**: Ekspor dan unduh semua gambar PNG QR Code tamu per acara dalam 1 arsip `.zip` terstruktur, dilengkapi ringkasan `DAFTAR_TAMU_ACARA.csv`.
  - **Backup & Restore JSON**: Fitur pengamanan data khusus untuk deployment cloud/container (seperti Hostinger App Platform) agar data tidak hilang saat re-deploy.
- **Layar Sambutan TV / Videotron Real-time (`/tv`, `/display`, `/live`)**:
  - Tampilan visual mewah rasio 16:9 yang responsif untuk Smart TV, Videotron panggung, proyektor, atau monitor lobi penerima tamu.
  - **Instant Pop-up Welcome**: Begitu usher memindai QR tamu menggunakan iPad/tablet, nama tamu, kategori (VIP/Family/VVIP), dan ucapan sambutan langsung muncul di layar TV secara instan (<100ms).
  - **Dual Real-time Engine**: Menggunakan **Server-Sent Events (SSE)** berkinerja tinggi serta fallback polling otomatis untuk menjamin keandalan koneksi di Smart TV.
  - **Audio Chime Synthesizer**: Nada lonceng sambutan otomatis (menggunakan Web Audio API tanpa perlu file eksternal).
  - **Jam Digital WIB**: Jam digital besar dan tanggal real-time zona waktu Jakarta (WIB / UTC+7).
  - **Ticker Kedatangan Terkini**: Menampilkan daftar tamu yang baru saja tiba di bagian bawah layar secara otomatis.
- **Zona Waktu Presisi (WIB / Asia/Jakarta)**:
  - Seluruh pencatatan waktu kehadiran, filter tanggal hari ini, dan jam scanner menggunakan zona waktu resmi Jakarta (UTC+7).
- **Generasi QR Code Otomatis**:
  - Token unik alfanumerik 12 karakter (contoh: `8HD82KS92JS82`)
  - File gambar PNG QR Code otomatis tersimpan di folder `/qr/`
  - URL presensi/undangan: `http://localhost:3000/check/:token`
- **Manajemen & Ekspor QR Card**:
  - Desain kartu QR elegan berlatar putih dengan nama tamu dan nama acara di bawah QR
  - **Download PNG** (High-Resolution image)
  - **Download PDF** (Ukuran A6 siap cetak)
  - **Cetak Langsung (Print Card)**
  - **Kirim WhatsApp Otomatis** dengan teks undangan terformat & tautan tiket digital
  - **Salin Tautan Undangan**
- **Sistem Scanner Hari Acara (`/scanner`)**:
  - Tampilan *fullscreen* dengan latar gradien biru tua (*Dark Navy*)
  - Pemindai kamera responsif menggunakan `html5-qrcode`
  - Mendukung kamera smartphone, kamera belakang (*rear/environment*), dan kamera depan (*front*)
  - **Success Screen Animation**: Animasi *fade in*, efek *blue glow*, centang (*check icon*), menampilkan nama tamu, nama acara, kategori, dan waktu kedatangan (*Arrival: HH:MM WIB*)
  - **Duplicate Prevention Screen**: Notifikasi *TAMU SUDAH HADIR* dengan tampilan waktu check-in sebelumnya
  - **Invalid QR Screen**: Peringatan merah *QR TIDAK VALID - Undangan tidak ditemukan*
  - **Feedback Audio Real-time**: Sintesis nada chimes sukses, peringatan, dan error menggunakan Web Audio API
  - **Fallback Input Manual**: Usher/penerima tamu dapat mengetik atau menempelkan token jika kamera smartphone bermasalah
  - Tombol pintas cepat untuk membuka Layar TV Sambutan.
- **Halaman Undangan Tamu Publik (`/check/:token`)**:
  - Menampilkan kartu undangan digital personal bagi tamu, detail lokasi, tombol Google Maps, dan tiket QR pass untuk ditunjukkan di lokasi acara.

---

## 🛠️ Arsitektur & Teknologi

- **Backend**: Node.js & Express.js
- **Database**: SQLite (menggunakan driver performa tinggi `better-sqlite3` dengan WAL mode)
- **Keamanan**:
  - Hashing password dengan `bcryptjs`
  - Autentikasi sesi JWT (*JSON Web Token*)
  - Validasi token & pencegahan presensi ganda
- **Frontend**:
  - HTML5 & CSS3
  - Tailwind CSS dengan tema palet khusus (*Primary Blue #2563EB, Dark Navy #0F172A, Soft Blue #EFF6FF, Accent Gold #D4AF37*)
  - Alpine.js untuk interaktivitas reaktif yang ringan dan cepat
  - Lucide Icons
  - Chart.js untuk visualisasi data
  - html2canvas & jsPDF untuk ekspor PNG & PDF

---

## 📂 Struktur Proyek

```
c:/xampp/htdocs/qr-invite/
├── backend/
│   ├── server.js                # Server entrypoint & routing
│   ├── database/
│   │   ├── db.js                # Koneksi SQLite & auto-seed
│   │   ├── schema.sql           # Skema tabel users, events, guests
│   │   └── database.sqlite      # File database SQLite
│   ├── routes/
│   │   ├── auth.js              # Route autentikasi
│   │   ├── events.js            # Route CRUD acara
│   │   ├── guests.js            # Route CRUD & toggle tamu
│   │   └── scanner.js           # Route scan presensi & tiket publik
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── eventController.js
│   │   ├── guestController.js
│   │   └── scannerController.js
│   └── middleware/
│       └── authMiddleware.js    # Proteksi rute dengan JWT
├── frontend/
│   ├── index.html               # Halaman Login Admin
│   ├── admin.html               # Halaman Dashboard Admin
│   ├── scanner.html             # Halaman Scanner Hari Acara
│   ├── check.html               # Halaman Tiket Undangan Tamu Publik
│   └── assets/
│       ├── css/
│       │   └── style.css        # Gaya tema, animasi, dan cetak
│       └── js/
│           ├── app.js           # Shared API client & Audio feedback
│           ├── admin.js         # Alpine.js logic admin & chart
│           └── scanner.js       # Alpine.js scanner & kamera logic
├── qr/                          # Penyimpanan file gambar QR Code PNG
├── package.json
├── .env
└── README.md
```

---

## ⚡ Cara Menjalankan Aplikasi

### 1. Instalasi Dependensi (Bila belum terpasang)
```bash
npm install
```

### 2. Jalankan Server
```bash
npm start
# atau
npm run dev
```

Server akan aktif di: **`http://localhost:3000`**

---

## 🔑 Kredensial Administrator Bawaan (Default Demo)

- **URL Login**: `http://localhost:3000/login` (atau `http://localhost:3000/`)
- **Email**: `admin@digitalinvite.com`
- **Password**: `admin123`

*(Tersedia tombol satu-klik "Isi Demo Kredensial" di halaman login untuk pengujian cepat).*

---

## 📡 Daftar Endpoint API

### Autentikasi
- `POST /api/login` - Login admin & mendapatkan JWT token.
- `GET /api/auth/me` - Verifikasi sesi admin aktif.

### Acara (*Events*)
- `GET /api/events` - Menampilkan semua acara beserta jumlah tamu dan kehadiran.
- `GET /api/events/:id` - Menampilkan detail 1 acara.
- `GET /api/events/:id/download-qrs` - Mengunduh seluruh QR Code tamu dalam 1 file `.zip`.
- `POST /api/events` - Membuat acara baru.
- `PUT /api/events/:id` - Memperbarui data acara.
- `DELETE /api/events/:id` - Menghapus acara dan seluruh tamu terkait.

### Tamu (*Guests*)
- `GET /api/guests` - Daftar tamu (dukung filter `event_id`, `category`, `status`, `search`).
- `GET /api/guests/export/csv` - Ekspor data tamu ke file CSV terformat UTF-8 BOM.
- `GET /api/guests/export/qr-zip?event_id=:id` - Mengunduh file zip seluruh QR Code acara.
- `POST /api/guests/import` - Batch import data tamu masal & auto-generate QR code.
- `GET /api/guests/:id` - Detail data tamu.
- `POST /api/guests` - Menambahkan tamu baru & otomatis membuat token QR dan file gambar QR.
- `PUT /api/guests/:id` - Memperbarui data tamu.
- `DELETE /api/guests/:id` - Menghapus data tamu & membersihkan file QR.
- `POST /api/guests/:id/toggle-attendance` - Mengubah status kehadiran secara manual.

### Scanner & Presensi (*Check-in*)
- `GET /api/check/:token` - Validasi token & mencatat kehadiran (`attendance_status = 'PRESENT'`).
  - Response sukses:
    ```json
    {
      "valid": true,
      "already_checked_in": false,
      "guest": "Budi Santoso",
      "event": "Wedding Ahmad & Siti",
      "category": "VIP",
      "arrival_time": "2026-10-02 10:24:00",
      "formatted_arrival": "10:24 WIB",
      "message": "Kehadiran Berhasil Dicatat"
    }
    ```
  - Response tamu sudah hadir sebelumnya:
    ```json
    {
      "valid": true,
      "already_checked_in": true,
      "guest": "Budi Santoso",
      "event": "Wedding Ahmad & Siti",
      "arrival_time": "2026-10-02 10:20:00",
      "message": "TAMU SUDAH HADIR"
    }
    ```
  - Response token invalid:
    ```json
    {
      "valid": false,
      "message": "Undangan tidak ditemukan"
    }
    ```
- `GET /api/invite/:token` - Mengambil data publik undangan untuk halaman tiket tamu.
- `GET /api/stats` - Statistik agregat untuk dashboard.

### Layar TV & Live Display Real-Time
- `GET /tv` (alias `/display`, `/live`) - Tampilan visual Layar Sambutan TV Fullscreen.
- `GET /api/live/stream` - Endpoint Server-Sent Events (SSE) untuk transmisi data check-in instan (<100ms) ke layar TV/videotron.
- `GET /api/live/data` - Endpoint status data awal & fallback polling untuk layar TV.
- `POST /api/guests/restore-backup` - Endpoint pemulihan full backup database dari file JSON.
