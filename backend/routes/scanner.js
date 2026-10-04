const express = require('express');
const router = express.Router();
const scannerController = require('../controllers/scannerController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Primary check & attendance endpoint matching specification
router.get('/check/:token', scannerController.checkAndRecordAttendance);
router.post('/check/:token', scannerController.checkAndRecordAttendance);
router.post('/scan', scannerController.checkAndRecordAttendance);

// Public invitation data for guest view
router.get('/invite/:token', scannerController.getGuestInvitePublic);

// Dashboard statistics
router.get('/stats', authMiddleware, scannerController.getStats);

module.exports = router;
