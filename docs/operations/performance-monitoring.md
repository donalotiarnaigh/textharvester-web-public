# Performance Monitoring

This document describes the performance monitoring and logging system for the Text Harvester application.

## Overview

The application includes comprehensive performance tracking and logging capabilities with configurable verbosity levels and sampling to balance observability with performance.

## Logging Configuration

### Verbose Mode

By default, the application uses sampled logging to reduce I/O overhead and protect sensitive data. You can enable verbose mode for debugging when needed.

#### Enabling Verbose Mode

**Method 1: Environment Variable**
```bash
VERBOSE_LOGGING=true npm start
```

**Method 2: Configuration File**
Edit `config.json`:
```json
{
  "logging": {
    "verboseMode": true
  }
}
```

**Method 3: Runtime (via logger)**
```javascript
const logger = require('./src/utils/logger');
logger.setVerboseMode(true);
```

#### What Verbose Mode Enables

- **Full Payload Logging**: Raw API responses and requests are logged without truncation
- **Debug Messages**: All debug-level messages are displayed
- **Complete Error Details**: Full error stacks and context information
- **Unsampled Logging**: All performance metrics and API calls are logged

### Sampling Configuration

When verbose mode is disabled, the system uses sampling to reduce log volume:

```json
{
  "logging": {
    "samplingRate": {
      "enabled": true,
      "performanceMetrics": 0.1,  // Log 10% of performance metrics
      "payloadLogging": 0.05      // Log 5% of raw payloads
    }
  }
}
```

### Payload Truncation

Large payloads are automatically truncated to prevent log files from growing too large:

```json
{
  "logging": {
    "payloadTruncation": {
      "enabled": true,
      "maxLength": 500  // Maximum characters before truncation
    }
  }
}
```

## Performance Tracking

### Bounded Metrics Storage

The system automatically manages memory usage by limiting stored metrics:

- **Recent Metrics**: Last 50 API calls (reduced from 100)
- **Metric History**: Last 500 entries per metric type (reduced from 1000)
- **Error History**: Last 5 errors per provider/model (reduced from 10)
- **Data Retention**: 12 hours (reduced from 24 hours)

### Performance Alerts

The system monitors performance and generates alerts for:

- **Response Time**: Warning at 10s, Critical at 30s, Severe at 60s
- **Success Rate**: Warning below 95%, Critical below 90%, Severe below 80%
- **Memory Usage**: Warning at 10MB, Critical at 50MB, Severe at 100MB

### Accessing Performance Data

#### Via Logger Analytics
```javascript
const logger = require('./src/utils/logger');
const analytics = logger.getAnalytics();
console.log(analytics.configuration); // Current logging configuration
```

#### Via Performance Tracker
```javascript
const PerformanceTracker = require('./src/utils/performanceTracker');
const tracker = PerformanceTracker.getInstance();

// Get current statistics
const stats = tracker.getStats();

// Get recent metrics
const recent = tracker.getRecentMetrics(20);

// Get performance summary
const summary = tracker.generateSummary();
```

## Key Metrics Preserved

Even with reduced logging verbosity, the following key metrics are always captured:

1. **API Response Times**: All successful and failed API calls
2. **Error Rates**: Success/failure ratios by provider and model
3. **Memory Usage**: Memory deltas for performance tracking
4. **Processing Times**: End-to-end file processing durations
5. **Alert Conditions**: All performance threshold violations

## Troubleshooting

### When to Enable Verbose Mode

Enable verbose mode when:
- Debugging API integration issues
- Investigating specific error patterns
- Analyzing model response quality
- Troubleshooting performance problems

### Performance Impact

- **Normal Mode**: Minimal I/O overhead, sampled logging
- **Verbose Mode**: Higher I/O usage, complete logging
- **Memory Usage**: Bounded by configuration limits
- **Log File Growth**: Controlled by truncation and sampling

### Monitoring Log File Size

```bash
# Check current log file sizes
ls -lh logs/

# Monitor log growth in real-time
tail -f logs/combined.log
```

### Adjusting Sampling Rates

Update sampling rates without restarting:

```javascript
const logger = require('./src/utils/logger');
logger.updateSamplingRates({
  performanceMetrics: 0.2,  // Increase to 20%
  payloadLogging: 0.1       // Increase to 10%
});
```

## API Endpoints

The performance data is available through the existing results API and will be displayed in the results.html page without modification to preserve existing functionality.
