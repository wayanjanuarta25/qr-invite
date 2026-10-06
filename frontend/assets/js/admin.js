/**
 * Digital Invitation Platform - Admin Dashboard Logic
 */

document.addEventListener('alpine:init', () => {
  Alpine.data('adminDashboard', () => ({
    // Current Active Tab: 'dashboard' | 'guests' | 'events'
    activeTab: 'dashboard',

    // User session
    currentUser: null,

    // Events data
    events: [],
    selectedEventId: 'all', // 'all' or specific id
    selectedEvent: null,

    // Statistics
    stats: {
      total_guests: 0,
      confirmed_attendance: 0,
      not_arrived: 0,
      today_attendance: 0,
      categories: [],
      events: []
    },

    // Guests data
    guests: [],
    searchQuery: '',
    categoryFilter: 'all',
    statusFilter: 'all',
    isLoadingGuests: false,
    currentPage: 1,
    perPage: 10,

    // Modals
    isEventModalOpen: false,
    eventModalMode: 'create', // 'create' | 'edit'
    eventForm: {
      id: null,
      name: '',
      date: '',
      location: '',
      description: ''
    },

    isGuestModalOpen: false,
    guestModalMode: 'create', // 'create' | 'edit'
    guestForm: {
      id: null,
      event_id: '',
      name: '',
      phone: '',
      category: 'General',
      attendance_status: 'PENDING'
    },

    isQrModalOpen: false,
    currentQrGuest: null,

    // Import Guests Modal & State
    isImportModalOpen: false,
    importForm: {
      event_id: '',
      fileName: '',
      fileSizeText: '',
      parsedGuests: [],
      invalidRowsCount: 0,
      isSubmitting: false,
      progressText: ''
    },

    // Export Dropdown State
    isExportMenuOpen: false,

    // Batch QR Download State
    isQrSelectEventModalOpen: false,
    selectedBatchQrEventId: '',
    isDownloadingZip: false,
    zipProgress: {
      current: 0,
      total: 0,
      percent: 0,
      text: ''
    },

    // Charts references
    attendanceChart: null,
    categoryChart: null,

    async init() {
      if (!App.requireAuth()) return;
      this.currentUser = App.getUser() || { name: 'Administrator', email: 'admin@digitalinvite.com' };

      await this.loadEvents();
      await this.loadStats();
      await this.loadGuests();

      this.$nextTick(() => {
        lucide.createIcons();
        this.initCharts();
      });

      // Watch for filter changes
      this.$watch('selectedEventId', () => {
        this.currentPage = 1;
        this.updateSelectedEvent();
        this.loadStats();
        this.loadGuests();
      });

      this.$watch('categoryFilter', () => {
        this.currentPage = 1;
        this.loadGuests();
      });

      this.$watch('statusFilter', () => {
        this.currentPage = 1;
        this.loadGuests();
      });

      this.$watch('searchQuery', () => {
        this.currentPage = 1;
      });

      this.$watch('perPage', () => {
        this.currentPage = 1;
        this.$nextTick(() => lucide.createIcons());
      });
    },

    // Event Management
    async loadEvents() {
      try {
        const res = await App.api('/api/events');
        this.events = res.events || [];
        if (this.events.length > 0 && this.selectedEventId === 'all') {
          // Keep all as default or set to first
        }
        this.updateSelectedEvent();
      } catch (err) {
        App.toast('Gagal memuat daftar event: ' + err.message, 'error');
      }
    },

    updateSelectedEvent() {
      if (this.selectedEventId === 'all') {
        this.selectedEvent = null;
      } else {
        this.selectedEvent = this.events.find(e => String(e.id) === String(this.selectedEventId)) || null;
      }
    },

    openAddEventModal() {
      this.eventModalMode = 'create';
      this.eventForm = {
        id: null,
        name: '',
        date: new Date().toISOString().substring(0, 16),
        location: '',
        description: ''
      };
      this.isEventModalOpen = true;
      this.$nextTick(() => lucide.createIcons());
    },

    openEditEventModal(event) {
      this.eventModalMode = 'edit';
      this.eventForm = {
        id: event.id,
        name: event.name,
        date: event.date,
        location: event.location,
        description: event.description || ''
      };
      this.isEventModalOpen = true;
      this.$nextTick(() => lucide.createIcons());
    },

    async saveEvent() {
      if (!this.eventForm.name || !this.eventForm.date || !this.eventForm.location) {
        App.toast('Mohon lengkapi nama event, tanggal, dan lokasi', 'warning');
        return;
      }

      try {
        if (this.eventModalMode === 'create') {
          const res = await App.api('/api/events', {
            method: 'POST',
            body: JSON.stringify(this.eventForm)
          });
          App.toast('Event baru berhasil ditambahkan', 'success');
          this.selectedEventId = String(res.event.id);
        } else {
          await App.api(`/api/events/${this.eventForm.id}`, {
            method: 'PUT',
            body: JSON.stringify(this.eventForm)
          });
          App.toast('Event berhasil diperbarui', 'success');
        }

        this.isEventModalOpen = false;
        await this.loadEvents();
        await this.loadStats();
      } catch (err) {
        App.toast('Gagal menyimpan event: ' + err.message, 'error');
      }
    },

    async deleteEvent(event) {
      if (!confirm(`Apakah Anda yakin ingin menghapus event "${event.name}" beserta seluruh daftar tamunya?`)) {
        return;
      }

      try {
        await App.api(`/api/events/${event.id}`, { method: 'DELETE' });
        App.toast('Event berhasil dihapus', 'success');
        if (String(this.selectedEventId) === String(event.id)) {
          this.selectedEventId = 'all';
        }
        await this.loadEvents();
        await this.loadStats();
        await this.loadGuests();
      } catch (err) {
        App.toast('Gagal menghapus event: ' + err.message, 'error');
      }
    },

    // Statistics & Charts
    async loadStats() {
      try {
        const query = this.selectedEventId !== 'all' ? `?event_id=${this.selectedEventId}` : '';
        const res = await App.api(`/api/stats${query}`);
        if (res.success && res.stats) {
          this.stats = res.stats;
          this.updateCharts();
        }
      } catch (err) {
        console.error('Stats error:', err);
      }
    },

    initCharts() {
      const attCtx = document.getElementById('attendanceProgressChart');
      if (attCtx && !this.attendanceChart) {
        this.attendanceChart = new Chart(attCtx, {
          type: 'doughnut',
          data: {
            labels: ['Hadir (Confirmed)', 'Belum Hadir (Not Arrived)'],
            datasets: [{
              data: [this.stats.confirmed_attendance, this.stats.not_arrived],
              backgroundColor: ['#DC2626', '#E2E8F0'],
              hoverBackgroundColor: ['#B91C1C', '#CBD5E1'],
              borderWidth: 0,
              cutout: '76%'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => ` ${ctx.label}: ${ctx.raw} Tamu`
                }
              }
            }
          }
        });
      }

      const catCtx = document.getElementById('categoryBarChart');
      if (catCtx && !this.categoryChart) {
        const labels = ['VIP', 'Family', 'Friend', 'General'];
        const values = labels.map(l => {
          const found = this.stats.categories.find(c => c.category.toLowerCase() === l.toLowerCase());
          return found ? found.count : 0;
        });

        this.categoryChart = new Chart(catCtx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Total Tamu',
              data: values,
              backgroundColor: ['#D4AF37', '#9333EA', '#DC2626', '#64748B'],
              borderRadius: 8,
              borderSkipped: false
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: { stepSize: 1 }
              },
              x: {
                grid: { display: false }
              }
            }
          }
        });
      }
    },

    updateCharts() {
      if (this.attendanceChart) {
        this.attendanceChart.data.datasets[0].data = [
          this.stats.confirmed_attendance,
          this.stats.not_arrived
        ];
        this.attendanceChart.update();
      }

      if (this.categoryChart) {
        const labels = ['VIP', 'Family', 'Friend', 'General'];
        const values = labels.map(l => {
          const found = this.stats.categories.find(c => c.category.toLowerCase() === l.toLowerCase());
          return found ? found.count : 0;
        });
        this.categoryChart.data.datasets[0].data = values;
        this.categoryChart.update();
      }
    },

    get attendancePercentage() {
      if (!this.stats.total_guests || this.stats.total_guests === 0) return 0;
      return Math.round((this.stats.confirmed_attendance / this.stats.total_guests) * 100);
    },

    // Guests Management
    async loadGuests() {
      this.isLoadingGuests = true;
      try {
        const params = new URLSearchParams();
        if (this.selectedEventId !== 'all') params.append('event_id', this.selectedEventId);
        if (this.categoryFilter !== 'all') params.append('category', this.categoryFilter);
        if (this.statusFilter !== 'all') params.append('status', this.statusFilter);
        if (this.searchQuery.trim()) params.append('search', this.searchQuery.trim());

        const res = await App.api(`/api/guests?${params.toString()}`);
        this.guests = res.guests || [];
      } catch (err) {
        App.toast('Gagal memuat daftar tamu: ' + err.message, 'error');
      } finally {
        this.isLoadingGuests = false;
        this.$nextTick(() => lucide.createIcons());
      }
    },

    openAddGuestModal() {
      if (this.events.length === 0) {
        App.toast('Silakan buat event terlebih dahulu sebelum menambahkan tamu.', 'warning');
        return;
      }

      const defaultEventId = this.selectedEventId !== 'all' ? this.selectedEventId : this.events[0]?.id;

      this.guestModalMode = 'create';
      this.guestForm = {
        id: null,
        event_id: String(defaultEventId),
        name: '',
        phone: '',
        category: 'General',
        attendance_status: 'PENDING'
      };
      this.isGuestModalOpen = true;
      this.$nextTick(() => lucide.createIcons());
    },

    openEditGuestModal(guest) {
      this.guestModalMode = 'edit';
      this.guestForm = {
        id: guest.id,
        event_id: String(guest.event_id),
        name: guest.name,
        phone: guest.phone || '',
        category: guest.category || 'General',
        attendance_status: guest.attendance_status || 'PENDING'
      };
      this.isGuestModalOpen = true;
      this.$nextTick(() => lucide.createIcons());
    },

    async saveGuest() {
      if (!this.guestForm.name || !this.guestForm.event_id) {
        App.toast('Mohon pilih event dan isi nama lengkap tamu.', 'warning');
        return;
      }

      try {
        if (this.guestModalMode === 'create') {
          const res = await App.api('/api/guests', {
            method: 'POST',
            body: JSON.stringify(this.guestForm)
          });
          App.toast(`Tamu "${res.guest.name}" berhasil ditambahkan & QR dibuat!`, 'success');
          // Automatically offer to view the generated QR card
          this.openQrModal(res.guest);
        } else {
          await App.api(`/api/guests/${this.guestForm.id}`, {
            method: 'PUT',
            body: JSON.stringify(this.guestForm)
          });
          App.toast('Data tamu berhasil diperbarui.', 'success');
        }

        this.isGuestModalOpen = false;
        await this.loadGuests();
        await this.loadStats();
      } catch (err) {
        App.toast('Gagal menyimpan data tamu: ' + err.message, 'error');
      }
    },

    async deleteGuest(guest) {
      if (!confirm(`Hapus tamu "${guest.name}" dari daftar?`)) return;

      try {
        await App.api(`/api/guests/${guest.id}`, { method: 'DELETE' });
        App.toast('Tamu berhasil dihapus.', 'success');
        await this.loadGuests();
        await this.loadStats();
      } catch (err) {
        App.toast('Gagal menghapus tamu: ' + err.message, 'error');
      }
    },

    async toggleAttendance(guest) {
      try {
        const res = await App.api(`/api/guests/${guest.id}/toggle-attendance`, { method: 'POST' });
        App.toast(res.message, 'success');
        if (res.guest.attendance_status === 'PRESENT') {
          App.sound.playSuccess();
        }
        await this.loadGuests();
        await this.loadStats();
      } catch (err) {
        App.toast('Gagal mengubah status: ' + err.message, 'error');
      }
    },

    // QR Code Management Modal
    openQrModal(guest) {
      this.currentQrGuest = guest;
      this.isQrModalOpen = true;
      this.$nextTick(() => lucide.createIcons());
    },

    closeQrModal() {
      this.isQrModalOpen = false;
      this.currentQrGuest = null;
    },

    getPublicCheckUrl(token) {
      return `${window.location.origin}/check/${token}`;
    },

    async copyInviteLink(guest) {
      const url = this.getPublicCheckUrl(guest.qr_token);
      try {
        await navigator.clipboard.writeText(url);
        App.toast('Tautan undangan berhasil disalin ke clipboard!', 'success');
      } catch (e) {
        prompt('Salin tautan undangan berikut:', url);
      }
    },

    sendWhatsApp(guest) {
      const url = this.getPublicCheckUrl(guest.qr_token);
      const text = `Halo Bapak/Ibu/Saudara/i *${guest.name}*,\n\nAnda dengan hormat diundang untuk menghadiri *${guest.event_name}*.\n\nSilakan tunjukkan QR Code undangan digital Anda melalui tautan berikut:\n${url}\n\nTerima kasih dan sampai jumpa!`;
      const phone = (guest.phone || '').replace(/[^0-9]/g, '');
      const waUrl = phone ? `https://wa.me/${phone.startsWith('0') ? '62' + phone.substring(1) : phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank');
    },

    downloadPng(guest) {
      const card = document.getElementById('printable-qr-card');
      if (!card) return;

      App.toast('Menyiapkan gambar QR Card resolusi tinggi...', 'info');

      html2canvas(card, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#FFFFFF',
        logging: false
      }).then(canvas => {
        const link = document.createElement('a');
        link.download = `QR_Invite_${guest.name.replace(/\s+/g, '_')}_${guest.qr_token}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        App.toast('QR Card PNG berhasil diunduh!', 'success');
      }).catch(err => {
        console.error('PNG error:', err);
        App.toast('Gagal membuat gambar PNG: ' + err.message, 'error');
      });
    },

    downloadPdf(guest) {
      const card = document.getElementById('printable-qr-card');
      if (!card) return;

      App.toast('Membuat file PDF undangan...', 'info');

      html2canvas(card, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#FFFFFF'
      }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a6'
        });

        const imgWidth = 85;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        const x = (105 - imgWidth) / 2;
        const y = (148 - imgHeight) / 2;

        pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
        pdf.save(`Tiket_Undangan_${guest.name.replace(/\s+/g, '_')}.pdf`);
        App.toast('Dokumen PDF berhasil diunduh!', 'success');
      }).catch(err => {
        console.error('PDF error:', err);
        App.toast('Gagal membuat PDF: ' + err.message, 'error');
      });
    },

        // Download official 3-page invitation PDF for a single guest
    async downloadFullInvitationPdf(guest) {
      if (!guest || !guest.id) return;
      App.toast("Sedang membuat file PDF undangan resmi...", "info");
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/guests/" + guest.id + "/invitation-pdf", {
          headers: { "Authorization": "Bearer " + token }
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Gagal mengunduh file PDF");
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const cleanName = (guest.name || "Tamu").replace(/[/\\?%*:|"<>]/g, "").trim().replace(/\s+/g, "_");
        a.download = "Undangan_" + cleanName + "_" + (guest.qr_token || "") + ".pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        App.toast("Undangan PDF resmi berhasil diunduh!", "success");
      } catch (err) {
        console.error("Download PDF error:", err);
        App.toast(err.message || "Gagal mengunduh undangan PDF resmi.", "error");
      }
    },

    // Download batch ZIP of all invitation PDFs
    async downloadBatchInvitationsPdf() {
      const activeEventId = this.filters.event_id;
      if (!activeEventId || activeEventId === "all") {
        if (this.events && this.events.length > 0) {
          this.selectedBatchQrEventId = String(this.events[0].id);
          this.isQrSelectEventModalOpen = true;
          App.toast("Silakan pilih acara terlebih dahulu untuk download undangan.", "info");
          return;
        } else {
          App.toast("Belum ada acara tersedia.", "warning");
          return;
        }
      }
      this.executeDownloadInvitationsZip(activeEventId);
    },

    async executeDownloadInvitationsZip(eventId) {
      App.toast("Sedang memproses seluruh undangan PDF...", "info");
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/guests/export/invitations-zip?event_id=" + eventId, {
          headers: { "Authorization": "Bearer " + token }
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Gagal membuat arsip ZIP undangan.");
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Undangan_Lengkap_Acara_" + Date.now() + ".zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        App.toast("Arsip ZIP Undangan berhasil diunduh!", "success");
      } catch (err) {
        console.error("ZIP Invitations error:", err);
        App.toast(err.message || "Gagal mengunduh arsip ZIP undangan.", "error");
      }
    },
    printQrCard() {
      window.print();
    },

    // Category styling helper
    getCategoryBadgeClass(category) {
      switch ((category || '').toLowerCase()) {
        case 'vip':
          return 'bg-amber-100 text-amber-800 border-amber-300';
        case 'family':
          return 'bg-purple-100 text-purple-800 border-purple-300';
        case 'friend':
          return 'bg-blue-100 text-blue-800 border-blue-300';
        default:
          return 'bg-slate-100 text-slate-800 border-slate-300';
      }
    },

    formatDateTime(dtStr) {
      if (!dtStr) return '-';
      try {
        const cleanStr = String(dtStr).replace('T', ' ').trim();
        const [datePart, timePart] = cleanStr.split(' ');
        if (datePart && datePart.includes('-') && /^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
          const [y, m, d] = datePart.split('-');
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
          const mIdx = parseInt(m, 10) - 1;
          const monthName = months[mIdx] || m;
          const timeFormatted = timePart ? ' ' + timePart.substring(0, 5) + ' WIB' : '';
          return `${parseInt(d, 10)} ${monthName} ${y}${timeFormatted}`;
        }
        const d = new Date(cleanStr.replace(' ', 'T'));
        if (isNaN(d.getTime())) {
          return dtStr;
        }
        return d.toLocaleDateString('id-ID', {
          timeZone: 'Asia/Jakarta',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (e) {
        return dtStr;
      }
    },

    formatTimeOnly(dtStr) {
      if (!dtStr) return '-';
      try {
        const cleanStr = dtStr.replace('T', ' ').trim();
        const parts = cleanStr.split(' ');
        if (parts.length >= 2) {
          const timePart = parts[1].substring(0, 5); // "HH:mm"
          return `${timePart} WIB`;
        }
        const d = new Date(cleanStr.replace(' ', 'T'));
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `${h}:${m} WIB`;
      } catch (e) {
        return dtStr;
      }
    },

    // ==========================================
    // FITUR PAGINATION DAFTAR TAMU
    // ==========================================

    get totalPages() {
      if (!this.guests || this.guests.length === 0) return 1;
      return Math.max(1, Math.ceil(this.guests.length / this.perPage));
    },

    get paginatedGuests() {
      if (!this.guests) return [];
      const start = (this.currentPage - 1) * this.perPage;
      return this.guests.slice(start, start + this.perPage);
    },

    get paginationStartIndex() {
      if (!this.guests || this.guests.length === 0) return 0;
      return (this.currentPage - 1) * this.perPage + 1;
    },

    get paginationEndIndex() {
      if (!this.guests) return 0;
      return Math.min(this.currentPage * this.perPage, this.guests.length);
    },

    get paginationPages() {
      const total = this.totalPages;
      const current = this.currentPage;
      if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1);
      }
      if (current <= 4) {
        return [1, 2, 3, 4, 5, '...', total];
      }
      if (current >= total - 3) {
        return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
      }
      return [1, '...', current - 1, current, current + 1, '...', total];
    },

    goToPage(page) {
      if (page === '...' || page < 1 || page > this.totalPages) return;
      this.currentPage = page;
      this.$nextTick(() => lucide.createIcons());
    },

    prevPage() {
      if (this.currentPage > 1) {
        this.goToPage(this.currentPage - 1);
      }
    },

    nextPage() {
      if (this.currentPage < this.totalPages) {
        this.goToPage(this.currentPage + 1);
      }
    },

    // ==========================================
    // FITUR 1: IMPORT & EXPORT DATA TAMU
    // ==========================================

    openImportModal() {
      if (this.events.length === 0) {
        App.toast('Silakan buat acara terlebih dahulu sebelum mengimpor tamu.', 'warning');
        return;
      }

      const defaultEventId = this.selectedEventId !== 'all' ? this.selectedEventId : this.events[0]?.id;
      this.importForm = {
        event_id: String(defaultEventId),
        fileName: '',
        fileSizeText: '',
        parsedGuests: [],
        invalidRowsCount: 0,
        isSubmitting: false,
        progressText: ''
      };
      this.isImportModalOpen = true;
      this.$nextTick(() => lucide.createIcons());
    },

    handleImportFileChange(e) {
      const file = e.target.files ? e.target.files[0] : (e.dataTransfer ? e.dataTransfer.files[0] : null);
      if (!file) return;

      this.importForm.fileName = file.name;
      this.importForm.fileSizeText = (file.size / 1024).toFixed(1) + ' KB';
      this.importForm.parsedGuests = [];
      this.importForm.invalidRowsCount = 0;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = evt.target.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          if (!rawRows || rawRows.length === 0) {
            App.toast('File Excel/CSV tidak memiliki baris data.', 'warning');
            return;
          }

          const parsed = [];
          let invalidCount = 0;

          rawRows.forEach((row) => {
            // Find columns dynamically
            let nameVal = '';
            let phoneVal = '';
            let catVal = 'General';

            for (const key of Object.keys(row)) {
              const k = key.toLowerCase().trim();
              const val = String(row[key]).trim();

              if (!nameVal && (k.includes('nama') || k.includes('name') || k.includes('tamu') || k.includes('guest'))) {
                nameVal = val;
              } else if (!phoneVal && (k.includes('hp') || k.includes('phone') || k.includes('telp') || k.includes('wa') || k.includes('kontak') || k.includes('nomor') || k.includes('mobile'))) {
                phoneVal = val;
              } else if (k.includes('kategori') || k.includes('category') || k.includes('kat') || k.includes('tipe') || k.includes('type')) {
                catVal = val || 'General';
              }
            }

            // Fallback: If no column headers matched name, check first column if it's text
            if (!nameVal) {
              const firstVal = String(Object.values(row)[0] || '').trim();
              if (firstVal && !firstVal.match(/^[0-9]+$/)) {
                nameVal = firstVal;
              }
            }

            if (nameVal) {
              // Normalize category
              let normCat = 'General';
              const lowerCat = catVal.toLowerCase();
              if (lowerCat.includes('vip')) normCat = 'VIP';
              else if (lowerCat.includes('fam') || lowerCat.includes('keluarga')) normCat = 'Family';
              else if (lowerCat.includes('frie') || lowerCat.includes('teman')) normCat = 'Friend';

              parsed.push({
                name: nameVal,
                phone: phoneVal,
                category: normCat
              });
            } else {
              invalidCount++;
            }
          });

          this.importForm.parsedGuests = parsed;
          this.importForm.invalidRowsCount = invalidCount;

          if (parsed.length > 0) {
            App.toast(`Berhasil membaca ${parsed.length} tamu dari file ${file.name}`, 'success');
          } else {
            App.toast('Tidak ditemukan kolom nama tamu yang valid dalam file.', 'error');
          }
          this.$nextTick(() => lucide.createIcons());
        } catch (err) {
          console.error('Parse file error:', err);
          App.toast('Gagal membaca file: ' + err.message, 'error');
        }
      };

      reader.readAsBinaryString(file);
    },

    async restoreBackupJson(e) {
      const file = e.target.files ? e.target.files[0] : null;
      if (!file) return;

      if (!confirm(`Apakah Anda yakin ingin me-restore data dari file "${file.name}"?`)) {
        e.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const json = JSON.parse(evt.target.result);
          if (!json.events || !Array.isArray(json.events)) {
            App.toast('Format file JSON tidak sesuai standar backup QR Invite.', 'error');
            return;
          }

          App.toast('Sedang memulihkan data acara & tamu...', 'info');
          try {
            const res = await App.api('/api/guests/restore-backup', {
              method: 'POST',
              body: JSON.stringify(json)
            });

            App.toast(res.message, 'success');
            this.isImportModalOpen = false;
            await this.loadEvents();
            await this.loadStats();
            await this.loadGuests();
          } catch (apiErr) {
            console.warn('Backend restore route unavailable, using client fallback:', apiErr);
            // Fallback restore via standard endpoints
            const eventMap = {};
            for (const ev of (json.events || [])) {
              let existing = this.events.find(e => e.name === ev.name);
              if (existing) {
                eventMap[ev.id] = existing.id;
              } else {
                const newEv = await App.api('/api/events', {
                  method: 'POST',
                  body: JSON.stringify({
                    name: ev.name,
                    date: ev.date,
                    location: ev.location,
                    description: ev.description || ''
                  })
                });
                eventMap[ev.id] = newEv.event.id;
              }
            }
            await this.loadEvents();

            let guestCount = 0;
            for (const g of (json.guests || [])) {
              const targetEvId = eventMap[g.event_id] || (this.events[0]?.id);
              if (!targetEvId) continue;
              await App.api('/api/guests', {
                method: 'POST',
                body: JSON.stringify({
                  event_id: targetEvId,
                  name: g.name,
                  phone: g.phone || '',
                  category: g.category || 'General'
                })
              });
              guestCount++;
            }

            App.toast(`Berhasil restore ${guestCount} tamu!`, 'success');
            this.isImportModalOpen = false;
            await this.loadEvents();
            await this.loadStats();
            await this.loadGuests();
          }
        } catch (err) {
          console.error('Restore error:', err);
          App.toast('Gagal restore: ' + err.message, 'error');
        } finally {
          e.target.value = '';
        }
      };
      reader.readAsText(file);
    },

    downloadImportTemplate(format = 'xlsx') {
      const sampleData = [
        { "Nama Tamu": "Budi Santoso", "Nomor HP": "081234567890", "Kategori": "VIP" },
        { "Nama Tamu": "Siti Nurhaliza", "Nomor HP": "082345678901", "Kategori": "Family" },
        { "Nama Tamu": "Agus Pratama", "Nomor HP": "083456789012", "Kategori": "Friend" },
        { "Nama Tamu": "Dewi Sartika", "Nomor HP": "085678901234", "Kategori": "General" }
      ];

      if (format === 'xlsx') {
        const ws = XLSX.utils.json_to_sheet(sampleData);
        ws['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 15 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Daftar Tamu");
        XLSX.writeFile(wb, "Template_Import_Tamu.xlsx");
        App.toast('Template Excel (.xlsx) berhasil diunduh!', 'success');
      } else {
        const csvContent = '\uFEFFNama Tamu,Nomor HP,Kategori\r\nBudi Santoso,081234567890,VIP\r\nSiti Nurhaliza,082345678901,Family\r\nAgus Pratama,083456789012,Friend\r\nDewi Sartika,085678901234,General\r\n';
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Template_Import_Tamu.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        App.toast('Template CSV (.csv) berhasil diunduh!', 'success');
      }
    },

    async submitImport() {
      if (!this.importForm.event_id) {
        App.toast('Silakan pilih acara tujuan import.', 'warning');
        return;
      }
      if (this.importForm.parsedGuests.length === 0) {
        App.toast('Belum ada data tamu valid yang siap diimpor.', 'warning');
        return;
      }

      this.importForm.isSubmitting = true;
      this.importForm.progressText = 'Menyimpan data tamu & meng-generate QR Code...';

      try {
        // Try fast batch endpoint
        const res = await App.api('/api/guests/import', {
          method: 'POST',
          body: JSON.stringify({
            event_id: this.importForm.event_id,
            guests: this.importForm.parsedGuests
          })
        });

        App.toast(res.message || 'Import data tamu berhasil!', 'success');
        this.isImportModalOpen = false;
        await this.loadGuests();
        await this.loadStats();
        await this.loadEvents();
      } catch (err) {
        console.warn('Batch import fallback to sequential:', err);
        // Fallback: loop through guests sequentially
        let successCount = 0;
        for (let i = 0; i < this.importForm.parsedGuests.length; i++) {
          const g = this.importForm.parsedGuests[i];
          this.importForm.progressText = `Mengimpor tamu ${i + 1} dari ${this.importForm.parsedGuests.length}...`;
          try {
            await App.api('/api/guests', {
              method: 'POST',
              body: JSON.stringify({
                event_id: this.importForm.event_id,
                name: g.name,
                phone: g.phone,
                category: g.category
              })
            });
            successCount++;
          } catch (e) {
            console.error('Failed row:', g, e);
          }
        }

        App.toast(`Berhasil mengimpor ${successCount} dari ${this.importForm.parsedGuests.length} tamu!`, 'success');
        this.isImportModalOpen = false;
        await this.loadGuests();
        await this.loadStats();
        await this.loadEvents();
      } finally {
        this.importForm.isSubmitting = false;
      }
    },

    exportGuests(format = 'xlsx') {
      this.isExportMenuOpen = false;
      if (!this.guests || this.guests.length === 0) {
        App.toast('Tidak ada data tamu untuk diekspor.', 'warning');
        return;
      }

      const activeEvent = this.selectedEvent ? this.selectedEvent.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Semua_Acara';
      const timestamp = new Date().toISOString().substring(0, 10);

      if (format === 'xlsx') {
        const rows = this.guests.map((g, idx) => ({
          'No': idx + 1,
          'Nama Tamu': g.name,
          'Nomor HP': g.phone || '-',
          'Acara': g.event_name,
          'Kategori': g.category,
          'Status Kehadiran': g.attendance_status === 'PRESENT' ? 'Hadir (PRESENT)' : 'Belum Hadir (PENDING)',
          'Waktu Hadir': g.arrival_time ? this.formatDateTime(g.arrival_time) : '-',
          'Token QR': g.qr_token,
          'Link Undangan Digital': `${window.location.origin}/check/${g.qr_token}`
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
          { wch: 6 },
          { wch: 26 },
          { wch: 16 },
          { wch: 28 },
          { wch: 12 },
          { wch: 22 },
          { wch: 20 },
          { wch: 16 },
          { wch: 45 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Daftar Tamu");
        const filename = `Daftar_Tamu_${activeEvent}_${timestamp}.xlsx`;
        XLSX.writeFile(wb, filename);
        App.toast(`Data tamu berhasil diekspor ke Excel (${filename})!`, 'success');
      } else {
        // CSV Export
        const escapeCsv = (val) => {
          if (val === null || val === undefined) return '""';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        };

        const headers = [
          'No',
          'Nama Tamu',
          'Nomor HP',
          'Acara',
          'Kategori',
          'Status Kehadiran',
          'Waktu Kedatangan',
          'Token QR',
          'Link Undangan Digital'
        ];

        const csvLines = [headers.join(',')];
        this.guests.forEach((g, idx) => {
          const inviteUrl = `${window.location.origin}/check/${g.qr_token}`;
          const statusLabel = g.attendance_status === 'PRESENT' ? 'Hadir (PRESENT)' : 'Belum Hadir (PENDING)';
          csvLines.push([
            escapeCsv(idx + 1),
            escapeCsv(g.name),
            escapeCsv(g.phone || '-'),
            escapeCsv(g.event_name),
            escapeCsv(g.category),
            escapeCsv(statusLabel),
            escapeCsv(g.arrival_time || '-'),
            escapeCsv(g.qr_token),
            escapeCsv(inviteUrl)
          ].join(','));
        });

        const csvContent = '\uFEFF' + csvLines.join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = `Daftar_Tamu_${activeEvent}_${timestamp}.csv`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        App.toast(`Data tamu berhasil diekspor ke CSV (${filename})!`, 'success');
      }
    },

    async exportBackupJson() {
      try {
        App.toast('Menyiapkan file backup database...', 'info');
        const [evRes, guestRes] = await Promise.all([
          App.api('/api/events'),
          App.api('/api/guests')
        ]);
        const backupData = {
          version: '1.0',
          exported_at: new Date().toISOString(),
          events: evRes.events || [],
          guests: guestRes.guests || []
        };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const nowStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date()).replace(/ /g, '_').replace(/:/g, '-');
        a.download = `backup_database_qr_invite_${nowStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.isExportMenuOpen = false;
        App.toast(`Berhasil membuat file backup (${backupData.guests.length} tamu, ${backupData.events.length} acara)!`, 'success');
      } catch (err) {
        console.error('Export backup error:', err);
        App.toast('Gagal membuat backup: ' + err.message, 'error');
      }
    },

    // ==========================================
    // FITUR 2: DOWNLOAD QR CODE SELURUH TAMU BY ACARA
    // ==========================================

    downloadEventQrs(eventOrId) {
      let targetEvent = null;

      if (eventOrId && typeof eventOrId === 'object' && eventOrId.id) {
        targetEvent = eventOrId;
      } else if (eventOrId && typeof eventOrId === 'string' && eventOrId !== 'all') {
        targetEvent = this.events.find(e => String(e.id) === String(eventOrId));
      } else if (this.selectedEventId !== 'all') {
        targetEvent = this.events.find(e => String(e.id) === String(this.selectedEventId));
      }

      if (!targetEvent) {
        // If no single event selected, open modal to let user pick which event
        this.selectedBatchQrEventId = this.events[0]?.id ? String(this.events[0].id) : '';
        this.isQrSelectEventModalOpen = true;
        this.$nextTick(() => lucide.createIcons());
        return;
      }

      this.executeZipDownload(targetEvent);
    },

    async executeZipDownload(event) {
      if (!event) return;

      this.isDownloadingZip = true;
      this.zipProgress = {
        current: 0,
        total: 0,
        percent: 0,
        text: `Menyiapkan download QR Code untuk "${event.name}"...`
      };

      const safeEventName = event.name.replace(/[/\\?%*:|"<>]/g, '').trim().replace(/\s+/g, '_');

      // 1. Try Backend ZIP Download Endpoint
      try {
        const token = App.getToken();
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const response = await fetch(`/api/events/${event.id}/download-qrs`, { headers });

        if (response.ok) {
          const blob = await response.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `QR_Codes_${safeEventName}.zip`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(downloadUrl);

          App.toast(`File ZIP QR Code untuk "${event.name}" berhasil diunduh!`, 'success');
          this.isDownloadingZip = false;
          this.isQrSelectEventModalOpen = false;
          return;
        }
      } catch (err) {
        console.warn('Backend ZIP download failed, proceeding to client-side packaging:', err);
      }

      // 2. Client-side JSZip Fallback Packaging
      try {
        const res = await App.api(`/api/guests?event_id=${event.id}`);
        const guests = res.guests || [];

        if (guests.length === 0) {
          App.toast(`Belum ada tamu yang terdaftar pada acara "${event.name}".`, 'warning');
          this.isDownloadingZip = false;
          return;
        }

        const zip = new JSZip();
        const folder = zip.folder(`QR_${safeEventName}`);
        const csvLines = ['No,Nama Tamu,Nomor HP,Kategori,Token,Status,File Gambar QR'];

        for (let i = 0; i < guests.length; i++) {
          const g = guests[i];
          const pct = Math.round(((i + 1) / guests.length) * 100);
          this.zipProgress = {
            current: i + 1,
            total: guests.length,
            percent: pct,
            text: `Mengemas QR code (${i + 1}/${guests.length}): ${g.name}...`
          };

          const cleanName = g.name.replace(/[/\\?%*:|"<>]/g, '').trim().replace(/\s+/g, '_');
          const fileName = `${g.category}_${cleanName}_${g.qr_token}.png`;

          try {
            const imgRes = await fetch(g.qr_image || `/qr/qr_${g.qr_token}.png`);
            if (imgRes.ok) {
              const imgBlob = await imgRes.blob();
              folder.file(fileName, imgBlob);
            }
          } catch (e) {
            console.error(`Failed to fetch QR for ${g.name}`, e);
          }

          csvLines.push(`"${i + 1}","${g.name.replace(/"/g, '""')}","${(g.phone || '').replace(/"/g, '""')}","${g.category}","${g.qr_token}","${g.attendance_status}","${fileName}"`);
        }

        folder.file('DAFTAR_TAMU.csv', '\uFEFF' + csvLines.join('\r\n'));

        this.zipProgress.text = 'Mengompres seluruh file ke dalam format ZIP...';
        const zipContent = await zip.generateAsync({
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        });

        const downloadUrl = window.URL.createObjectURL(zipContent);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `QR_Codes_${safeEventName}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);

        App.toast(`Berhasil mengunduh ${guests.length} QR Code (${a.download})!`, 'success');
        this.isQrSelectEventModalOpen = false;
      } catch (err) {
        console.error('JSZip error:', err);
        App.toast('Gagal membuat ZIP QR Code: ' + err.message, 'error');
      } finally {
        this.isDownloadingZip = false;
      }
    }
  }));
});

