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
        this.updateSelectedEvent();
        this.loadStats();
        this.loadGuests();
      });

      this.$watch('categoryFilter', () => this.loadGuests());
      this.$watch('statusFilter', () => this.loadGuests());
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
        const d = new Date(dtStr.replace(' ', 'T'));
        return d.toLocaleDateString('id-ID', {
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
        const d = new Date(dtStr.replace(' ', 'T'));
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `${h}:${m} WIB`;
      } catch (e) {
        return dtStr;
      }
    }
  }));
});
