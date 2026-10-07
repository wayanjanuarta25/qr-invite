/**
 * Digital Invitation Platform - Admin Dashboard Logic
 */

document.addEventListener('alpine:init', () => {
  Alpine.data('adminDashboard', () => ({
    // Current Active Tab: 'dashboard' | 'guests' | 'events'
    activeTab: localStorage.getItem('qr_invite_admin_tab') || 'guests',

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
      invitations: [],
      rsvps: [],
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
    isDuplicateModalOpen: false,
    isUserDuplicateModalOpen: false,
    isResolvingUserDuplicates: false,
    pendingUserRestoreJson: null,
    userDuplicateList: [],
    userDuplicateDecisions: {},
    isResolvingDuplicates: false,
    pendingRestoreJson: null,
    restoreDuplicateList: [],
    duplicateDecisions: {},

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
      source: '',
      contact_person: '',
      invitation_status: 'Belum Dikirim',
      rsvp_status: 'Belum Konfirmasi',
      notes: '',
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
        // Name similarity detection state
    similarGuestsNotice: [],
    editingCell: null, // { guestId, field, value, originalValue }
    undoStack: [],
    redoStack: [],
    sortBy: 'created_at',
    sortDir: 'desc',
    detectedDuplicatesCount: 0,
    isFilterDuplicatesActive: false,
    allGuestsCache: [],
    // Komparasi & Deteksi Otomatis State
    compareThreshold: 65,
    compareSearchQuery: '',
    compareCategoryFilter: 'all',
    compareSelectedPair: null,
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

    // Role & User Management State (Admin only)
    usersList: [],
    isLoadingUsers: false,
    isUserModalOpen: false,
    userModalMode: 'create', // 'create' | 'edit'
    userForm: {
      id: null,
      name: '',
      email: '',
      password: '',
      role: 'Admin',
      status: 'ACTIVE'
    },
    activityLogs: [],
    isLoadingLogs: false,
    logFilterAction: 'all',
    logLimit: 100,

    async init() {
      if (!App.requireAuth()) return;
      this.currentUser = App.getUser() || { name: 'Administrator', email: 'admin@digitalinvite.com' };

      await this.loadEvents();
      await this.loadStats();
      await this.loadGuests();
      if (this.isAdmin) {
        this.loadUsers();
        this.loadActivityLogs();
      }

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
        const labels = ['Pejabat TNI', 'Pejabat Luar', 'Sahabat Satsiber', 'VIP', 'General'];
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
              backgroundColor: ['#DC2626', '#2563EB', '#059669', '#D97706', '#64748B'],
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
        const labels = ['Pejabat TNI', 'Pejabat Luar', 'Sahabat Satsiber', 'VIP', 'General'];
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
        this.evaluateGlobalDuplicates();
      } catch (err) {
        App.toast('Gagal memuat daftar tamu: ' + err.message, 'error');
      } finally {
        this.isLoadingGuests = false;
        this.$nextTick(() => lucide.createIcons());
      }
    },

        setSourceSuggestion(val) {
      this.guestForm.source = val;
    },

        // Bersihkan kotak pencarian dan muat ulang tamu
    clearSearch() {
      this.searchQuery = '';
      this.currentPage = 1;
      this.loadGuests();
      this.$nextTick(() => {
        if (window.lucide) lucide.createIcons();
      });
    },

    handleNameAltEnter(e) {
      if (e.altKey && e.key === 'Enter') {
        e.preventDefault();
        const input = e.target;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const val = this.guestForm.name || '';
        this.guestForm.name = val.substring(0, start) + '\n' + val.substring(end);
        this.$nextTick(() => {
          input.selectionStart = input.selectionEnd = start + 1;
        });
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
        source: '',
        contact_person: '',
        invitation_status: 'Belum Dikirim',
        rsvp_status: 'Belum Konfirmasi',
        notes: '',
        attendance_status: 'PENDING'
      };
      this.similarGuestsNotice = [];
      this.isGuestModalOpen = true;
      this.$nextTick(() => { if (window.lucide) lucide.createIcons(); });
    },

    openEditGuestModal(guest) {
      this.guestModalMode = 'edit';
      this.guestForm = {
        id: guest.id,
        event_id: String(guest.event_id),
        name: guest.name,
        phone: guest.phone || '',
        category: guest.category || 'Pejabat TNI',
        source: guest.source || '',
        contact_person: guest.contact_person || '',
        invitation_status: guest.invitation_status || 'Belum Dikirim',
        rsvp_status: guest.rsvp_status || 'Belum Konfirmasi',
        notes: guest.notes || '',
        attendance_status: guest.attendance_status || 'PENDING'
      };
      this.similarGuestsNotice = [];
      this.isGuestModalOpen = true;
      this.$nextTick(() => { if (window.lucide) lucide.createIcons(); });
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
        downloadFullInvitationPdf(guest) {
      if (!guest || !guest.id) return;
      App.toast("Sedang menyiapkan file PDF undangan...", "info");
      const token = App.getToken();
      window.location.href = "/api/guests/" + guest.id + "/invitation-pdf?token=" + (token || "");
    },

    downloadBatchInvitationsPdf() {
      let targetEventId = this.filters.event_id;
      if (!targetEventId || targetEventId === 'all') {
        const eventWithGuests = this.events.find(e => (e.total_guests || 0) > 0);
        if (eventWithGuests) {
          targetEventId = eventWithGuests.id;
        } else if (this.guests && this.guests.length > 0) {
          targetEventId = this.guests[0].event_id;
        } else if (this.events && this.events.length > 0) {
          targetEventId = this.events[0].id;
        }
      }

      if (!targetEventId) {
        App.toast('Belum ada acara atau data tamu yang tersedia.', 'warning');
        return;
      }

      this.executeDownloadInvitationsZip(targetEventId);
    },

    executeDownloadInvitationsZip(eventId) {
      App.toast("Memulai pengunduhan file ZIP undangan... Browser sedang mengunduh.", "info");
      const token = App.getToken();
      window.location.href = "/api/guests/export/invitations-zip?event_id=" + eventId + "&token=" + (token || "");
    },

        // Helper: Hitung kemiripan string (0 - 100%) menggunakan Levenshtein distance & token overlap
    calculateNameSimilarity(str1, str2) {
      if (!str1 || !str2) return 0;
      const s1 = str1.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      const s2 = str2.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      if (s1 === s2) return 100;
      if (s1.length === 0 || s2.length === 0) return 0;

      // Cek apakah satu nama termuat utuh dalam nama lainnya
      if (s1.includes(s2) || s2.includes(s1)) {
        const minLen = Math.min(s1.length, s2.length);
        const maxLen = Math.max(s1.length, s2.length);
        return Math.round((minLen / maxLen) * 95);
      }

      // Levenshtein distance
      const track = Array(s2.length + 1).fill(null).map(() =>
        Array(s1.length + 1).fill(null)
      );
      for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
      for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
      for (let j = 1; j <= s2.length; j += 1) {
        for (let i = 1; i <= s1.length; i += 1) {
          const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
          track[j][i] = Math.min(
            track[j][i - 1] + 1,
            track[j - 1][i] + 1,
            track[j - 1][i - 1] + indicator
          );
        }
      }
      const distance = track[s2.length][s1.length];
      const maxLen = Math.max(s1.length, s2.length);
      return Math.round(((maxLen - distance) / maxLen) * 100);
    },

    // Cek kemiripan nama tamu saat input/edit form tamu
    checkSimilarGuestNames() {
      const inputName = (this.guestForm.name || '').trim();
      if (inputName.length < 3) {
        this.similarGuestsNotice = [];
        return;
      }

      const currentId = this.guestForm.id;
      const results = [];
      const guestsToCheck = this.guests || [];

      for (const g of guestsToCheck) {
        if (currentId && g.id === currentId) continue;
        const sim = this.calculateNameSimilarity(inputName, g.name);
        if (sim >= 70) {
          results.push({
            name: g.name,
            category: g.category,
            phone: g.phone,
            similarity: sim
          });
        }
      }

      results.sort((a, b) => b.similarity - a.similarity);
      this.similarGuestsNotice = results.slice(0, 5);
      this.$nextTick(() => { if (window.lucide) lucide.createIcons(); });
    },

    // Evaluasi kemiripan nama secara global pada list tamu
    evaluateGlobalDuplicates() {
      const list = this.guests || [];
      let dupCount = 0;
      const seen = new Set();

      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const sim = this.calculateNameSimilarity(list[i].name, list[j].name);
          if (sim >= 80) {
            seen.add(list[i].id);
            seen.add(list[j].id);
          }
        }
      }
      this.detectedDuplicatesCount = seen.size;
    },

    // Getter: Daftar pasangan data tamu hasil komparasi & filter otomatis kemiripan
    get comparedPairs() {
      const list = this.guests || [];
      if (list.length < 2) return [];

      const threshold = parseInt(this.compareThreshold, 10) || 65;
      const search = (this.compareSearchQuery || '').toLowerCase().trim();
      const cat = this.compareCategoryFilter;

      const pairs = [];

      for (let i = 0; i < list.length; i++) {
        const gA = list[i];
        if (cat !== 'all' && gA.category !== cat) continue;

        for (let j = i + 1; j < list.length; j++) {
          const gB = list[j];
          if (cat !== 'all' && gB.category !== cat) continue;

          const sim = this.calculateNameSimilarity(gA.name, gB.name);
          if (sim >= threshold) {
            // Filter pencarian nama/instansi/token
            if (search) {
              const matchA = (gA.name || '').toLowerCase().includes(search) || (gA.qr_token || '').toLowerCase().includes(search);
              const matchB = (gB.name || '').toLowerCase().includes(search) || (gB.qr_token || '').toLowerCase().includes(search);
              if (!matchA && !matchB) continue;
            }

            pairs.push({
              guestA: gA,
              guestB: gB,
              similarity: sim,
              isExact: sim >= 99,
              isHigh: sim >= 80
            });
          }
        }
      }

      // Urutkan dari kemiripan tertinggi ke terendah
      return pairs.sort((a, b) => b.similarity - a.similarity);
    },

    // Aksi Navigasi langsung ke Tab Komparasi Data
    openComparisonPage() {
      this.switchTab('compare');
      this.$nextTick(() => { if (window.lucide) lucide.createIcons(); });
    },

    // Filter toggle untuk menampilkan hanya nama yang mirip/duplikat
    filterDuplicateNames() {
      if (this.isFilterDuplicatesActive) {
        this.isFilterDuplicatesActive = false;
        if (this.allGuestsCache && this.allGuestsCache.length > 0) {
          this.guests = [...this.allGuestsCache];
        }
      } else {
        this.allGuestsCache = [...(this.guests || [])];
        const list = this.guests || [];
        const duplicateIds = new Set();

        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const sim = this.calculateNameSimilarity(list[i].name, list[j].name);
            if (sim >= 80) {
              duplicateIds.add(list[i].id);
              duplicateIds.add(list[j].id);
            }
          }
        }

        this.guests = list.filter(g => duplicateIds.has(g.id));
        this.isFilterDuplicatesActive = true;
      }
      this.$nextTick(() => { if (window.lucide) lucide.createIcons(); });
    },

        // Quick inline update for guest table fields with Undo support
    async updateGuestField(guest, fieldName, newValue, skipUndo = false) {
      const oldValue = guest[fieldName];
      if (oldValue === newValue) return;

      try {
        if (!skipUndo) {
          this.undoStack.push({
            guestId: guest.id,
            fieldName: fieldName,
            oldValue: oldValue,
            newValue: newValue
          });
          this.redoStack = []; // Reset redo
        }

        guest[fieldName] = newValue;
        const payload = {
          name: guest.name,
          phone: guest.phone,
          category: guest.category,
          source: guest.source,
          contact_person: guest.contact_person,
          invitation_status: guest.invitation_status,
          rsvp_status: guest.rsvp_status,
          notes: guest.notes,
          attendance_status: guest.attendance_status
        };
        payload[fieldName] = newValue;

        const res = await App.api('/api/guests/' + guest.id, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (res.guest) {
          Object.assign(guest, res.guest);
        }

        App.toast('Perubahan ' + fieldName.replace('_', ' ') + ' tersimpan.', 'success');
        this.$nextTick(() => { if (window.lucide) lucide.createIcons(); });
      } catch (err) {
        console.error('Update guest field error:', err);
        App.toast('Gagal menyimpan: ' + err.message, 'error');
        guest[fieldName] = oldValue;
      }
    },

    // Excel-like Inline Edit Methods
    startInlineEdit(guest, field) {
      this.editingCell = {
        guestId: guest.id,
        field: field,
        value: guest[field] || '',
        originalValue: guest[field] || ''
      };
    },

    insertLineBreak(event) {
      const textarea = event.target;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      textarea.value = val.substring(0, start) + '\n' + val.substring(end);
      this.editingCell.value = textarea.value;
      this.$nextTick(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1;
      });
    },

    cancelInlineEdit() {
      this.editingCell = null;
    },

    async saveInlineEdit(guest) {
      if (!this.editingCell || this.editingCell.guestId !== guest.id) return;
      const field = this.editingCell.field;
      const val = typeof this.editingCell.value === 'string' ? (this.editingCell.field === 'name' ? this.editingCell.value.replace(/\r\n/g, '\n') : this.editingCell.value.trim()) : this.editingCell.value;
      const orig = this.editingCell.originalValue;

      this.editingCell = null;
      if (val !== orig) {
        await this.updateGuestField(guest, field, val);
      }
    },

    // Refresh Data Tombol (⟳)
    async refreshData() {
      App.toast('Memuat ulang data terbaru...', 'info');
      await this.loadGuests();
      await this.loadStats();
      await this.loadEvents();
      App.toast('Data berhasil diperbarui!', 'success');
    },

    // Undo Terakhir (↶)
    async undoLastAction() {
      if (this.undoStack.length === 0) return;
      const action = this.undoStack.pop();
      const guest = (this.guests || []).find(g => g.id === action.guestId);
      if (guest) {
        this.redoStack.push({ ...action });
        await this.updateGuestField(guest, action.fieldName, action.oldValue, true);
        App.toast('Perubahan dibatalkan (Undo).', 'info');
      }
    },

    // Redo Terakhir (↷)
    async redoLastAction() {
      if (this.redoStack.length === 0) return;
      const action = this.redoStack.pop();
      const guest = (this.guests || []).find(g => g.id === action.guestId);
      if (guest) {
        this.undoStack.push({ ...action });
        await this.updateGuestField(guest, action.fieldName, action.newValue, true);
        App.toast('Perubahan diterapkan kembali (Redo).', 'info');
      }
    },

    printQrCard() {
      window.print();
    },

    // Category styling helper
    getCategoryBadgeClass(category) {
      const cat = (category || '').toLowerCase();
      if (cat.includes('tni')) return 'bg-red-100 text-red-800 border-red-300';
      if (cat.includes('luar')) return 'bg-sky-100 text-sky-800 border-sky-300';
      if (cat.includes('sahabat') || cat.includes('satsiber')) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      if (cat.includes('vip')) return 'bg-amber-100 text-amber-800 border-amber-300';
      return 'bg-slate-100 text-slate-800 border-slate-300';
    },

    formatDateTime(dtStr) {
      if (!dtStr) return '-';
      try {
        let str = String(dtStr).trim();
        // Normalize SQLite 'YYYY-MM-DD HH:MM:SS' into UTC ISO string so JavaScript correctly adds +7h
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
          str = str.replace(' ', 'T') + 'Z';
        } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(str)) {
          str = str.replace(' ', 'T') + ':00Z';
        } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(str)) {
          str = str + 'Z';
        }

        const date = new Date(str);
        if (isNaN(date.getTime())) {
          return dtStr;
        }

        return new Intl.DateTimeFormat('id-ID', {
          timeZone: 'Asia/Jakarta',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(date) + ' WIB';
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

        // Toggle Sorting Column
        // Switch and persist active tab in localStorage
    switchTab(tabName) {
      this.activeTab = tabName;
      localStorage.setItem('qr_invite_admin_tab', tabName);
      this.$nextTick(() => { if (window.lucide) lucide.createIcons(); });
    },

    toggleSort(field) {
      if (this.sortBy === field) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.sortBy = field;
        this.sortDir = 'asc';
      }
      this.currentPage = 1;
      this.$nextTick(() => { if (window.lucide) lucide.createIcons(); });
    },

    get sortedGuests() {
      if (!this.guests || this.guests.length === 0) return [];
      const list = [...this.guests];
      const field = this.sortBy;
      const dir = this.sortDir === 'asc' ? 1 : -1;

      return list.sort((a, b) => {
        let valA = a[field] || '';
        let valB = b[field] || '';

        // If sorting dates (created_at or updated_at), compare timestamps
        if (field === 'created_at' || field === 'updated_at') {
          const timeA = valA ? new Date(valA).getTime() : 0;
          const timeB = valB ? new Date(valB).getTime() : 0;
          if (timeA < timeB) return -1 * dir;
          if (timeA > timeB) return 1 * dir;
          return 0;
        }

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
      });
    },

    get paginatedGuests() {
      const sorted = this.sortedGuests;
      if (!sorted) return [];
      const start = (this.currentPage - 1) * this.perPage;
      return sorted.slice(start, start + this.perPage);
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
            let sourceVal = '';
            let cpVal = '';
            let invStatusVal = 'Belum Dikirim';
            let rsvpStatusVal = 'Belum Konfirmasi';
            let notesVal = '';

            for (const key of Object.keys(row)) {
              const k = key.toLowerCase().trim();
              const val = String(row[key]).trim();

              if (!nameVal && (k.includes('nama') || k.includes('name') || k.includes('tamu') || k.includes('guest'))) {
                nameVal = val;
              } else if (!phoneVal && (k.includes('hp') || k.includes('phone') || k.includes('telp') || k.includes('wa') || k.includes('kontak') || k.includes('nomor') || k.includes('mobile') || k.includes('telfon'))) {
                phoneVal = val;
              } else if (k.includes('kategori') || k.includes('category') || k.includes('kat') || k.includes('tipe') || k.includes('type')) {
                catVal = val || 'General';
              } else if (k.includes('sumber') || k.includes('source') || k.includes('asal')) {
                sourceVal = val || '';
              } else if (k.includes('contact') || k.includes('cp') || k.includes('pic') || k.includes('person')) {
                cpVal = val || '';
              } else if (k.includes('status undangan') || k.includes('undangan') || k.includes('invitation')) {
                invStatusVal = val || 'Belum Dikirim';
              } else if (k.includes('konfirmasi') || k.includes('rsvp') || k.includes('kehadiran')) {
                rsvpStatusVal = val || 'Belum Konfirmasi';
              } else if (k.includes('keterangan') || k.includes('notes') || k.includes('note') || k.includes('catatan')) {
                notesVal = val || '';
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
              // Normalize category to official categories
              let normCat = 'General';
              const lowerCat = catVal.toLowerCase();
              if (lowerCat.includes('tni')) normCat = 'Pejabat TNI';
              else if (lowerCat.includes('luar')) normCat = 'Pejabat Luar';
              else if (lowerCat.includes('satsiber') || lowerCat.includes('sahabat')) normCat = 'Sahabat Satsiber';
              else if (lowerCat.includes('vip')) normCat = 'VIP';
              else if (['pejabat tni', 'pejabat luar', 'sahabat satsiber', 'vip', 'general'].includes(lowerCat)) normCat = catVal;

              parsed.push({
                name: nameVal,
                phone: phoneVal,
                category: normCat,
                source: sourceVal,
                contact_person: cpVal,
                invitation_status: invStatusVal,
                rsvp_status: rsvpStatusVal,
                notes: notesVal
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

          App.toast('Mengecek data backup...', 'info');
          const res = await App.api('/api/guests/restore-backup', {
            method: 'POST',
            body: JSON.stringify({
              events: json.events,
              guests: json.guests || [],
              defaultStrategy: 'ask'
            })
          });

          if (res.hasDuplicates && res.duplicates && res.duplicates.length > 0) {
            // Ada data double: Tampilkan modal untuk bertanya ke pengguna
            this.pendingRestoreJson = json;
            this.restoreDuplicateList = res.duplicates;
            this.duplicateDecisions = {};
            // Default: pertahankan data yang sudah ada (existing)
            res.duplicates.forEach(d => {
              this.duplicateDecisions[d.index] = 'existing';
            });
            this.isDuplicateModalOpen = true;
            this.$nextTick(() => { if (window.lucide) lucide.createIcons(); });
            return;
          }

          App.toast(res.message || 'Pemulihan data berhasil!', 'success');
          this.isImportModalOpen = false;
          await this.loadEvents();
          await this.loadStats();
          await this.loadGuests();
        } catch (err) {
          console.error('Restore error:', err);
          App.toast('Gagal restore: ' + err.message, 'error');
        } finally {
          e.target.value = '';
        }
      };
      reader.readAsText(file);
    },

    setAllDuplicateDecisions(choice) {
      if (!this.restoreDuplicateList) return;
      this.restoreDuplicateList.forEach(d => {
        this.duplicateDecisions[d.index] = choice;
      });
    },

    async confirmAndExecuteRestore() {
      if (!this.pendingRestoreJson) return;
      this.isResolvingDuplicates = true;
      try {
        const res = await App.api('/api/guests/restore-backup', {
          method: 'POST',
          body: JSON.stringify({
            events: this.pendingRestoreJson.events,
            guests: this.pendingRestoreJson.guests || [],
            duplicateDecisions: this.duplicateDecisions,
            defaultStrategy: 'custom'
          })
        });

        App.toast(res.message || 'Pemulihan data selesai!', 'success');
        this.isDuplicateModalOpen = false;
        this.isImportModalOpen = false;
        this.pendingRestoreJson = null;
        this.restoreDuplicateList = [];
        this.duplicateDecisions = {};

        await this.loadEvents();
        await this.loadStats();
        await this.loadGuests();
      } catch (err) {
        console.error('Confirm restore error:', err);
        App.toast('Gagal menyelesaikan restore: ' + err.message, 'error');
      } finally {
        this.isResolvingDuplicates = false;
      }
    },

    downloadImportTemplate(format = 'xlsx') {
      const sampleData = [
        {
          "Nama Tamu": "Marsekal TNI Fadjar Prasetyo",
          "Kategori": "Pejabat TNI",
          "Sumber": "Komandan",
          "Contact Person": "Mayor Adi",
          "Nomor HP": "081234567890",
          "Status Undangan": "Terkirim",
          "Konfirmasi Kehadiran": "Dapat Hadir",
          "Keterangan": "Hadir bersama ajudan"
        },
        {
          "Nama Tamu": "Dr. Eng. Hary Budiarto, M.Kom",
          "Kategori": "Pejabat Luar",
          "Sumber": "Wadan",
          "Contact Person": "Kapten Budi",
          "Nomor HP": "082345678901",
          "Status Undangan": "Terkirim",
          "Konfirmasi Kehadiran": "Belum Konfirmasi",
          "Keterangan": "Kepala Balitbang Kominfo"
        },
        {
          "Nama Tamu": "Ir. Budi Rahardjo, M.Sc., Ph.D.",
          "Kategori": "Sahabat Satsiber",
          "Sumber": "Asops",
          "Contact Person": "Ltk Angga",
          "Nomor HP": "083456789012",
          "Status Undangan": "Sudah Dijawab",
          "Konfirmasi Kehadiran": "Dapat Hadir",
          "Keterangan": "Pakar Cybersecurity ITB"
        },
        {
          "Nama Tamu": "Kolonel Laut (E) Tri Harsono",
          "Kategori": "VIP",
          "Sumber": "Ltk Angga",
          "Contact Person": "Mayor Dwi",
          "Nomor HP": "085678901234",
          "Status Undangan": "Belum Dikirim",
          "Konfirmasi Kehadiran": "Belum Konfirmasi",
          "Keterangan": "Undangan VIP Satsiber"
        },
        {
          "Nama Tamu": "Ahmad Rizky Pratama, S.Kom",
          "Kategori": "General",
          "Sumber": "Sekretariat",
          "Contact Person": "Sertu Rian",
          "Nomor HP": "087890123456",
          "Status Undangan": "Belum Dikirim",
          "Konfirmasi Kehadiran": "Belum Konfirmasi",
          "Keterangan": "Tamu Rekan Kerja"
        }
      ];

      if (format === 'xlsx') {
        const ws = XLSX.utils.json_to_sheet(sampleData);
        ws['!cols'] = [
          { wch: 32 },
          { wch: 18 },
          { wch: 16 },
          { wch: 18 },
          { wch: 16 },
          { wch: 18 },
          { wch: 22 },
          { wch: 28 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template Import Tamu");
        XLSX.writeFile(wb, "Template_Import_Tamu_HUT_SS.xlsx");
        App.toast('Template Excel (.xlsx) dengan struktur kolom terbaru berhasil diunduh!', 'success');
      } else {
        const headers = ["Nama Tamu", "Kategori", "Sumber", "Contact Person", "Nomor HP", "Status Undangan", "Konfirmasi Kehadiran", "Keterangan"];
        const rows = [headers.join(',')];
        const escapeCsv = (val) => '"' + String(val || '').replace(/"/g, '""') + '"';
        sampleData.forEach(item => {
          rows.push([
            escapeCsv(item["Nama Tamu"]),
            escapeCsv(item["Kategori"]),
            escapeCsv(item["Sumber"]),
            escapeCsv(item["Contact Person"]),
            escapeCsv(item["Nomor HP"]),
            escapeCsv(item["Status Undangan"]),
            escapeCsv(item["Konfirmasi Kehadiran"]),
            escapeCsv(item["Keterangan"])
          ].join(','));
        });
        const csvContent = '\uFEFF' + rows.join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Template_Import_Tamu_HUT_SS.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        App.toast('Template CSV (.csv) dengan struktur kolom terbaru berhasil diunduh!', 'success');
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
          'Kategori': g.category || 'General',
          'Sumber': g.source || '-',
          'Contact Person': g.contact_person || '-',
          'Nomor HP': g.phone || '-',
          'Status Undangan': g.invitation_status || 'Belum Dikirim',
          'Konfirmasi Kehadiran': g.rsvp_status || 'Belum Konfirmasi',
          'Status Kehadiran Scan': g.attendance_status === 'PRESENT' ? 'Hadir (PRESENT)' : 'Belum Hadir (PENDING)',
          'Keterangan': g.notes || '-',
          'Acara': g.event_name,
          'Waktu Hadir Scan': g.arrival_time ? this.formatDateTime(g.arrival_time) : '-',
          'Token QR': g.qr_token,
          'Link Undangan Digital': `${window.location.origin}/check/${g.qr_token}`
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [
          { wch: 6 },
          { wch: 28 },
          { wch: 18 },
          { wch: 16 },
          { wch: 18 },
          { wch: 16 },
          { wch: 18 },
          { wch: 22 },
          { wch: 22 },
          { wch: 25 },
          { wch: 24 },
          { wch: 20 },
          { wch: 16 },
          { wch: 45 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Daftar Tamu");
        const filename = `Daftar_Tamu_${activeEvent}_${timestamp}.xlsx`;
        XLSX.writeFile(wb, filename);
        App.toast(`Data tamu (${this.guests.length} baris) berhasil diekspor ke Excel (${filename})!`, 'success');
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
          'Kategori',
          'Sumber',
          'Contact Person',
          'Nomor HP',
          'Status Undangan',
          'Konfirmasi Kehadiran',
          'Status Kehadiran Scan',
          'Keterangan',
          'Acara',
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
            escapeCsv(g.category || 'General'),
            escapeCsv(g.source || '-'),
            escapeCsv(g.contact_person || '-'),
            escapeCsv(g.phone || '-'),
            escapeCsv(g.invitation_status || 'Belum Dikirim'),
            escapeCsv(g.rsvp_status || 'Belum Konfirmasi'),
            escapeCsv(statusLabel),
            escapeCsv(g.notes || '-'),
            escapeCsv(g.event_name),
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
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        const nowStr = [d.getFullYear(), pad(d.getMonth()+1), pad(d.getDate())].join('-') + '_' + pad(d.getHours()) + '-' + pad(d.getMinutes());
        a.download = `daftar_tamu_backup_${nowStr}.json`;
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
    },

    // Check if current user is admin
    get isAdmin() {
      if (!this.currentUser) return true;
      return !this.currentUser.role || this.currentUser.role === 'Admin';
    },

    // User Management Methods
    async loadUsers() {
      this.isLoadingUsers = true;
      try {
        const res = await App.api('/api/users');
        this.usersList = res.users || [];
      } catch (err) {
        console.warn('loadUsers error:', err);
      } finally {
        this.isLoadingUsers = false;
        this.$nextTick(() => lucide.createIcons());
      }
    },

    openAddUserModal() {
      this.userModalMode = 'create';
      this.userForm = {
        id: null,
        name: '',
        email: '',
        password: '',
        role: 'Admin',
        status: 'ACTIVE'
      };
      this.isUserModalOpen = true;
      this.$nextTick(() => lucide.createIcons());
    },

    openEditUserModal(user) {
      this.userModalMode = 'edit';
      this.userForm = {
        id: user.id,
        name: user.name,
        email: user.email,
        password: '',
        role: user.role || 'Admin',
        status: user.status || 'ACTIVE'
      };
      this.isUserModalOpen = true;
      this.$nextTick(() => lucide.createIcons());
    },

    async saveUser() {
      if (!this.userForm.name || !this.userForm.email) {
        App.toast('Nama dan email wajib diisi.', 'warning');
        return;
      }

      if (this.userModalMode === 'create' && (!this.userForm.password || this.userForm.password.length < 6)) {
        App.toast('Password minimal 6 karakter untuk akun baru.', 'warning');
        return;
      }

      try {
        if (this.userModalMode === 'create') {
          await App.api('/api/users', {
            method: 'POST',
            body: JSON.stringify(this.userForm)
          });
          App.toast('Akun baru berhasil dibuat!', 'success');
        } else {
          await App.api(`/api/users/${this.userForm.id}`, {
            method: 'PUT',
            body: JSON.stringify(this.userForm)
          });
          App.toast('Data akun berhasil diperbarui!', 'success');
        }

        this.isUserModalOpen = false;
        await this.loadUsers();
        await this.loadActivityLogs();
      } catch (err) {
        App.toast(err.message || 'Gagal menyimpan data akun', 'error');
      }
    },

    async deleteUser(user) {
      if (!confirm(`Apakah Anda yakin ingin menghapus akun "${user.name}" (${user.email})?`)) {
        return;
      }

      try {
        await App.api(`/api/users/${user.id}`, {
          method: 'DELETE'
        });
        App.toast(`Akun ${user.name} berhasil dihapus.`, 'success');
        await this.loadUsers();
        await this.loadActivityLogs();
      } catch (err) {
        App.toast(err.message || 'Gagal menghapus akun.', 'error');
      }
    },

    // ==========================================
    // EXPORT & IMPORT JSON MANAGEMENT AKUN
    // ==========================================
    async exportUsersJson() {
      try {
        App.toast('Menyiapkan file export data akun...', 'info');
        const res = await App.api('/api/users/export/json');
        if (!res.success || !res.users) {
          throw new Error(res.error || 'Gagal mengekspor data akun.');
        }

        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        const nowStr = [d.getFullYear(), pad(d.getMonth()+1), pad(d.getDate())].join('-') + '_' + pad(d.getHours()) + '-' + pad(d.getMinutes());
        const filename = `management_akun_backup_${nowStr}.json`;

        const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        App.toast(`Berhasil mengekspor ${res.users.length} akun ke file ${filename}!`, 'success');
      } catch (err) {
        console.error('exportUsersJson error:', err);
        App.toast('Gagal mengekspor data akun: ' + err.message, 'error');
      }
    },

    async importUsersJson(e) {
      const file = e.target.files ? e.target.files[0] : null;
      if (!file) return;

      if (!confirm(`Apakah Anda yakin ingin mengimpor data akun dari file "${file.name}"?`)) {
        e.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const json = JSON.parse(evt.target.result);
          const users = Array.isArray(json) ? json : (json.users || []);
          if (!users || !Array.isArray(users) || users.length === 0) {
            App.toast('Format file JSON tidak valid atau data akun kosong.', 'error');
            return;
          }

          App.toast('Mengecek data akun backup...', 'info');
          const res = await App.api('/api/users/import/json', {
            method: 'POST',
            body: JSON.stringify({
              users,
              defaultStrategy: 'ask'
            })
          });

          if (res.hasDuplicates && res.duplicates && res.duplicates.length > 0) {
            // Terdapat email akun yang sudah terdaftar
            this.pendingUserRestoreJson = users;
            this.userDuplicateList = res.duplicates;
            this.userDuplicateDecisions = {};
            // Default: pertahankan data lama (existing)
            res.duplicates.forEach(d => {
              this.userDuplicateDecisions[d.index] = 'existing';
            });
            this.isUserDuplicateModalOpen = true;
            this.$nextTick(() => { if (window.lucide) lucide.createIcons(); });
            return;
          }

          App.toast(res.message || 'Import data akun berhasil!', 'success');
          await this.loadUsers();
          await this.loadActivityLogs();
        } catch (err) {
          console.error('importUsersJson error:', err);
          App.toast('Gagal mengimpor akun: ' + err.message, 'error');
        } finally {
          e.target.value = '';
        }
      };
      reader.readAsText(file);
    },

    setAllUserDuplicateDecisions(choice) {
      if (!this.userDuplicateList) return;
      this.userDuplicateList.forEach(d => {
        this.userDuplicateDecisions[d.index] = choice;
      });
    },

    async confirmAndExecuteUserRestore() {
      if (!this.pendingUserRestoreJson) return;
      this.isResolvingUserDuplicates = true;
      try {
        const res = await App.api('/api/users/import/json', {
          method: 'POST',
          body: JSON.stringify({
            users: this.pendingUserRestoreJson,
            duplicateDecisions: this.userDuplicateDecisions,
            defaultStrategy: 'custom'
          })
        });

        App.toast(res.message || 'Import akun selesai!', 'success');
        this.isUserDuplicateModalOpen = false;
        this.pendingUserRestoreJson = null;
        this.userDuplicateList = [];
        this.userDuplicateDecisions = {};

        await this.loadUsers();
        await this.loadActivityLogs();
      } catch (err) {
        console.error('confirmAndExecuteUserRestore error:', err);
        App.toast('Gagal menyelesaikan import akun: ' + err.message, 'error');
      } finally {
        this.isResolvingUserDuplicates = false;
      }
    },

    // Activity Logs Methods
    async loadActivityLogs() {
      this.isLoadingLogs = true;
      try {
        const params = new URLSearchParams();
        if (this.logFilterAction !== 'all') params.append('action', this.logFilterAction);
        params.append('limit', this.logLimit);

        const res = await App.api(`/api/users/logs?${params.toString()}`);
        this.activityLogs = res.logs || [];
      } catch (err) {
        console.warn('loadActivityLogs error:', err);
      } finally {
        this.isLoadingLogs = false;
        this.$nextTick(() => lucide.createIcons());
      }
    },

    getActionBadgeClass(action) {
      if (!action) return 'bg-slate-100 text-slate-700 border-slate-200';
      if (action.includes('FAIL') || action.includes('BLOCK') || action.includes('DELETE')) {
        return 'bg-rose-50 text-rose-700 border-rose-200';
      }
      if (action.includes('SUCCESS') || action.includes('CREATE') || action.includes('IMPORT')) {
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      }
      if (action.includes('UPDATE')) {
        return 'bg-amber-50 text-amber-700 border-amber-200';
      }
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  }));
});

