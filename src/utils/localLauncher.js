const config = require('../../config.json');
const logger = require('./logger');

async function launchLocalApp() {
  try {
    const port = process.env.PORT || config.port;
    const url = `http://localhost:${port}`;

    if (config.local.autoLaunchBrowser) {
      // Use dynamic import for ESM-only 'open' package
      const { default: openBrowser } = await import('open');
      await openBrowser(url, {
        app: {
          name: config.local.defaultBrowser || 'chrome'
        }
      });
      logger.info(`Opened ${url} in ${config.local.defaultBrowser}`);
    }

    // Restore last session if enabled
    if (config.local.saveLastSession) {
      // You can implement session restoration logic here
      logger.info('Restored last session state');
    }
  } catch (error) {
    logger.error('Failed to launch local app:', error);
  }
}

module.exports = { launchLocalApp }; 