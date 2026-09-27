/**
 * @fileoverview Mobile Upload Routes
 *
 * Express routes for the mobile upload API endpoints.
 *
 * Endpoints:
 * - POST /upload - Accept photo uploads from iOS app
 *
 * @see docs/ios-async-upload/design.md
 */

const express = require('express');
const router = express.Router();
const { handleMobileUpload } = require('../controllers/mobileUploadHandler');

// POST /api/mobile/upload - Handle mobile photo uploads
router.post('/upload', handleMobileUpload);

module.exports = router;
