/**
 * Performance monitoring API routes
 */

const express = require('express');
const router = express.Router();
const PerformanceTracker = require('../utils/performanceTracker');
const logger = require('../utils/logger');

/**
 * Get current performance statistics
 * GET /api/performance/stats
 */
router.get('/stats', (req, res) => {
  try {
    const { provider, model } = req.query;
    const tracker = PerformanceTracker.getInstance();
    const stats = tracker.getStats(provider, model);
    
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting performance stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve performance statistics',
      message: error.message
    });
  }
});

/**
 * Get recent performance metrics
 * GET /api/performance/recent
 */
router.get('/recent', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const tracker = PerformanceTracker.getInstance();
    const recentMetrics = tracker.getRecentMetrics(limit);
    
    res.json({
      success: true,
      metrics: recentMetrics,
      count: recentMetrics.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting recent metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve recent metrics',
      message: error.message
    });
  }
});

/**
 * Get performance summary report
 * GET /api/performance/summary
 */
router.get('/summary', (req, res) => {
  try {
    const tracker = PerformanceTracker.getInstance();
    const summary = tracker.generateSummary();
    
    res.json({
      success: true,
      summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error generating performance summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate performance summary',
      message: error.message
    });
  }
});

/**
 * Get current system performance
 * GET /api/performance/system
 */
router.get('/system', (req, res) => {
  try {
    const systemMetrics = {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      system: systemMetrics
    });
  } catch (error) {
    logger.error('Error getting system metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve system metrics',
      message: error.message
    });
  }
});

/**
 * Get combined performance dashboard data
 * GET /api/performance/dashboard
 */
router.get('/dashboard', (req, res) => {
  try {
    const tracker = PerformanceTracker.getInstance();
    
    const dashboardData = {
      summary: tracker.generateSummary(),
      recentMetrics: tracker.getRecentMetrics(10),
      systemMetrics: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      },
      stats: tracker.getStats()
    };
    
    res.json({
      success: true,
      dashboard: dashboardData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting dashboard data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dashboard data',
      message: error.message
    });
  }
});

/**
 * Get recent performance alerts
 * GET /api/performance/alerts
 */
router.get('/alerts', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const tracker = PerformanceTracker.getInstance();
    const alerts = tracker.getRecentAlerts(limit);
    
    res.json({
      success: true,
      alerts,
      count: alerts.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting performance alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve performance alerts',
      message: error.message
    });
  }
});

/**
 * Get alert statistics
 * GET /api/performance/alerts/stats
 */
router.get('/alerts/stats', (req, res) => {
  try {
    const tracker = PerformanceTracker.getInstance();
    const stats = tracker.getAlertStats();
    
    res.json({
      success: true,
      alertStats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting alert statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve alert statistics',
      message: error.message
    });
  }
});

/**
 * Get current alert thresholds
 * GET /api/performance/thresholds
 */
router.get('/thresholds', (req, res) => {
  try {
    const tracker = PerformanceTracker.getInstance();
    const thresholds = tracker.getAlertThresholds();
    
    res.json({
      success: true,
      thresholds,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting alert thresholds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve alert thresholds',
      message: error.message
    });
  }
});

/**
 * Update alert thresholds
 * PUT /api/performance/thresholds
 */
router.put('/thresholds', (req, res) => {
  try {
    const { thresholds } = req.body;
    
    if (!thresholds || typeof thresholds !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid thresholds data',
        message: 'Thresholds must be provided as an object'
      });
    }
    
    const tracker = PerformanceTracker.getInstance();
    tracker.updateAlertThresholds(thresholds);
    
    logger.info('Performance alert thresholds updated', thresholds);
    
    res.json({
      success: true,
      message: 'Alert thresholds updated successfully',
      thresholds: tracker.getAlertThresholds(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating alert thresholds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update alert thresholds',
      message: error.message
    });
  }
});

/**
 * Get cleanup status and configuration
 * GET /api/performance/cleanup
 */
router.get('/cleanup', (req, res) => {
  try {
    const tracker = PerformanceTracker.getInstance();
    const cleanupStatus = tracker.getCleanupStatus();
    
    res.json({
      success: true,
      cleanup: cleanupStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting cleanup status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cleanup status',
      message: error.message
    });
  }
});

/**
 * Update cleanup configuration
 * PUT /api/performance/cleanup
 */
router.put('/cleanup', (req, res) => {
  try {
    const { config } = req.body;
    
    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid cleanup configuration',
        message: 'Config must be provided as an object'
      });
    }
    
    const tracker = PerformanceTracker.getInstance();
    tracker.updateCleanupConfig(config);
    
    logger.info('Performance cleanup configuration updated', config);
    
    res.json({
      success: true,
      message: 'Cleanup configuration updated successfully',
      cleanup: tracker.getCleanupStatus(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating cleanup configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update cleanup configuration',
      message: error.message
    });
  }
});

/**
 * Trigger manual cleanup
 * POST /api/performance/cleanup
 */
router.post('/cleanup', (req, res) => {
  try {
    const tracker = PerformanceTracker.getInstance();
    tracker.cleanupOldMetrics();
    
    logger.info('Manual cleanup triggered');
    
    res.json({
      success: true,
      message: 'Manual cleanup completed successfully',
      cleanup: tracker.getCleanupStatus(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error during manual cleanup:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform manual cleanup',
      message: error.message
    });
  }
});

/**
 * Clear performance metrics (for testing/debugging)
 * POST /api/performance/clear
 */
router.post('/clear', (req, res) => {
  try {
    const tracker = PerformanceTracker.getInstance();
    tracker.clearMetrics();
    
    logger.info('Performance metrics cleared');
    
    res.json({
      success: true,
      message: 'Performance metrics and alerts cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error clearing performance metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear performance metrics',
      message: error.message
    });
  }
});

module.exports = router;
