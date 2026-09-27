// Load environment variables from .env file
require('dotenv').config();

const Anthropic = require('@anthropic-ai/sdk');

async function listModels() {
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    
    console.log('Listing available Anthropic models...');
    const models = await anthropic.models.list();
    
    console.log('Available models:');
    models.data.forEach(model => {
      console.log(`- ${model.id} (${model.name})`);
    });
  } catch (error) {
    console.error('Error listing models:', error);
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  listModels();
}

module.exports = { listModels }; 