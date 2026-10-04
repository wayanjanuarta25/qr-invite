const express = require('express');
const router = express.Router();
const guestController = require('../controllers/guestController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/', authMiddleware, guestController.getAllGuests);
router.get('/export/csv', authMiddleware, guestController.exportGuestsCsv);
router.get('/export/qr-zip', authMiddleware, guestController.downloadEventQrsZip);
router.post('/import', authMiddleware, guestController.importGuests);
router.post('/restore-backup', authMiddleware, guestController.restoreFullBackup);
router.get('/:id', authMiddleware, guestController.getGuestById);
router.post('/', authMiddleware, guestController.createGuest);
router.put('/:id', authMiddleware, guestController.updateGuest);
router.delete('/:id', authMiddleware, guestController.deleteGuest);
router.post('/:id/toggle-attendance', authMiddleware, guestController.toggleAttendance);

module.exports = router;
