const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const guestController = require('../controllers/guestController');
const { authMiddleware } = require('../middleware/authMiddleware');

// Protected event routes
router.get('/', authMiddleware, eventController.getAllEvents);
router.get('/:id', authMiddleware, eventController.getEventById);
router.get('/:id/download-qrs', authMiddleware, guestController.downloadEventQrsZip);
router.post('/', authMiddleware, eventController.createEvent);
router.put('/:id', authMiddleware, eventController.updateEvent);
router.delete('/:id', authMiddleware, eventController.deleteEvent);

module.exports = router;
