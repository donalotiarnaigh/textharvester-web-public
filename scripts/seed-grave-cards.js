const { db } = require('../src/utils/database'); // eslint-disable-line no-unused-vars
const GraveCardStorage = require('../src/utils/graveCardStorage');
const logger = require('../src/utils/logger'); // eslint-disable-line no-unused-vars

async function seed() {
  try {
    console.log('Initializing grave_cards table...');
    await GraveCardStorage.initialize();

    console.log('Inserting dummy record...');
    const result = await GraveCardStorage.storeGraveCard({
      fileName: 'dummy_card.pdf',
      location: { section: 'A', grave_number: '999' },
      grave: { status: 'Occupied', type: 'Common' },
      interments: [
        { name: { full_name: 'John Doe' }, date_of_death: { iso: '1900-01-01' }, age: { years: 50 }, religion: 'RC' },
        { name: { full_name: 'Jane Doe' }, date_of_death: { iso: '1910-02-02' }, age: { years: 48 }, religion: 'RC' }
      ],
      inscription: { text: 'In Loving Memory of John and Jane Doe.' },
      ai_provider: 'manual_seed'
    });

    console.log(`Seeded grave card with ID: ${result.id}`);
  } catch (error) {
    console.error('Seeding failed:', error);
  }
}

seed();
