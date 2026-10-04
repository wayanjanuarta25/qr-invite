const express = require('express');
const router = express.Router();
const liveController = require('../controllers/liveController');

// Live TV Display SSE Stream
router.get('/stream', liveController.sseStream);

// Live TV Display Initial / Polling Data
router.get('/data', liveController.getLiveDisplayData);

module.exports = router;
