/**
 * Digital Invitation Platform - Dedicated QR Scanner Logic
 */

document.addEventListener('alpine:init', () => {
  Alpine.data('scannerApp', () => ({
    html5QrCode: null,
    cameras: [],
    selectedCameraId: null,
    isScanning: false,
    scannerError: null,
    scanLocked: false,

    // Active event context
    selectedEventId: 'all',
    events: [],

    // Result Overlays
    currentResult: null,
    overlayType: null, // 'success' | 'duplicate' | 'invalid'
    autoResumeTimer: null,
    countdownSeconds: 4,

    // Manual input fallback
    manualToken: '',
    isManualModalOpen: false,

    // Scanner log for session
    scanHistory: [],

    async init() {
      // Parse query params for event_id
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('event_id')) {
        this.selectedEventId = urlParams.get('event_id');
      }

      if (urlParams.get('preview') === 'success') {
        this.currentResult = {
          guest: urlParams.get('guest') || 'IQBAL',
          event: urlParams.get('event') || 'HUT SATSIBER TNI',
          formatted_arrival: urlParams.get('time') || '18:00 WIB'
        };
        this.overlayType = 'success';
        this.countdownSeconds = 99;
      } else {
        this.initCameras();
      }

      // Keyboard shortcut (Spacebar / Enter to resume)
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && this.overlayType) {
          e.preventDefault();
          this.resumeScanner();
        }
      });

      this.$nextTick(() => lucide.createIcons());
    },

    async loadEvents() {
      try {
        const res = await App.api('/api/events');
        this.events = res.events || [];
      } catch (e) {
        console.warn('Could not load events list for scanner:', e);
      }
    },

    async initCameras() {
      try {
        if (typeof Html5Qrcode === 'undefined') {
          setTimeout(() => this.initCameras(), 500);
          return;
        }

        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length) {
          this.cameras = devices;
          // Prefer back/environment camera if available
          const backCamera = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear') || 
            d.label.toLowerCase().includes('environment')
          );
          this.selectedCameraId = backCamera ? backCamera.id : devices[0].id;
          this.startScanner();
        } else {
          this.scannerError = 'Tidak ada kamera yang terdeteksi pada perangkat ini.';
        }
      } catch (err) {
        console.error('Camera initialization error:', err);
        this.scannerError = 'Izin kamera ditolak atau tidak didukung browser. Anda tetap dapat menggunakan input token manual di bawah.';
      }
    },

    async startScanner() {
      if (!this.selectedCameraId) return;

      try {
        if (this.html5QrCode && this.isScanning) {
          await this.html5QrCode.stop();
        }

        this.html5QrCode = new Html5Qrcode('qr-reader');
        this.scannerError = null;

        const config = {
          fps: 15,
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1.0
        };

        await this.html5QrCode.start(
          this.selectedCameraId,
          config,
          (decodedText, decodedResult) => {
            this.handleScanResult(decodedText);
          },
          (errorMessage) => {
            // frame scanning error, ignore
          }
        );

        this.isScanning = true;
      } catch (err) {
        console.error('Failed to start camera:', err);
        this.scannerError = 'Gagal membuka kamera: ' + (err.message || err);
        this.isScanning = false;
      }
    },

    async switchCamera(cameraId) {
      this.selectedCameraId = cameraId;
      await this.startScanner();
    },

    async handleScanResult(rawToken) {
      if (this.scanLocked) return;
      this.scanLocked = true;

      // Extract raw token if full URL was scanned
      let token = rawToken.trim();
      if (token.includes('/check/')) {
        const parts = token.split('/check/');
        token = parts[parts.length - 1].split('?')[0].split('#')[0].trim();
      }

      try {
        const url = `/api/check/${encodeURIComponent(token)}${this.selectedEventId !== 'all' ? '?event_id=' + this.selectedEventId : ''}`;
        const res = await App.api(url);

        if (res.valid) {
          if (res.already_checked_in) {
            // TAMU SUDAH HADIR
            App.sound.playWarning();
            this.showDuplicateScreen(res);
          } else {
            // SUCCESS - KEHADIRAN BERHASIL DICATAT
            App.sound.playSuccess();
            this.showSuccessScreen(res);
          }

          // Add to local scan history in Jakarta WIB time
          const fallbackWib = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date()) + ' WIB';
          this.scanHistory.unshift({
            time: res.formatted_arrival || fallbackWib,
            guest: res.guest,
            event: res.event,
            category: res.category,
            status: res.already_checked_in ? 'DUPLICATE' : 'SUCCESS'
          });
        }
      } catch (err) {
        // INVALID QR SCREEN
        App.sound.playError();
        this.showInvalidScreen(err.message || 'Undangan tidak ditemukan');
      }
    },

    showSuccessScreen(data) {
      this.currentResult = data;
      this.overlayType = 'success';
      this.startCountdown();
      this.$nextTick(() => lucide.createIcons());
    },

    showDuplicateScreen(data) {
      this.currentResult = data;
      this.overlayType = 'duplicate';
      this.startCountdown();
      this.$nextTick(() => lucide.createIcons());
    },

    showInvalidScreen(message) {
      this.currentResult = { message: message || 'Undangan tidak ditemukan' };
      this.overlayType = 'invalid';
      this.startCountdown();
      this.$nextTick(() => lucide.createIcons());
    },

    startCountdown() {
      if (this.autoResumeTimer) clearInterval(this.autoResumeTimer);
      this.countdownSeconds = 8;
      this.autoResumeTimer = setInterval(() => {
        this.countdownSeconds--;
        if (this.countdownSeconds <= 0) {
          clearInterval(this.autoResumeTimer);
          this.resumeScanner();
        }
      }, 1000);
    },

    resumeScanner() {
      if (this.autoResumeTimer) clearInterval(this.autoResumeTimer);
      this.overlayType = null;
      this.currentResult = null;
      // Slight delay before unlocking to avoid re-scanning the same code immediately
      setTimeout(() => {
        this.scanLocked = false;
      }, 800);
      this.$nextTick(() => lucide.createIcons());
    },

    async submitManualToken() {
      if (!this.manualToken.trim()) return;
      const tok = this.manualToken.trim();
      this.manualToken = '';
      this.isManualModalOpen = false;
      await this.handleScanResult(tok);
    },

    getCategoryBadgeClass(category) {
      switch ((category || '').toLowerCase()) {
        case 'vip':
          return 'bg-amber-100 text-amber-900 border-amber-300';
        case 'family':
          return 'bg-purple-100 text-purple-900 border-purple-300';
        case 'friend':
          return 'bg-blue-100 text-blue-900 border-blue-300';
        default:
          return 'bg-slate-100 text-slate-900 border-slate-300';
      }
    }
  }));
});
