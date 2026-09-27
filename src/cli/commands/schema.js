const { Command } = require('commander');
const readline = require('readline');
const glob = require('glob');
const { promisify } = require('util');
const SchemaGenerator = require('../../services/SchemaGenerator');
const SchemaManager = require('../../services/SchemaManager');
const { loadConfig } = require('../config');
const { createProvider } = require('../../utils/modelProviders');

const { formatError } = require('../output');

const globAsync = promisify(glob);

const schemaCommand = new Command('schema')
  .description('Manage custom document schemas');

schemaCommand
  .command('propose')
  .description('Propose a new schema from example files')
  .argument('<files...>', 'Path to example files (glob support)')
  .action(async (files) => {
    try {
      // 1. Resolve files
      let allFiles = [];
      for (const pattern of files) {
        const matches = await globAsync(pattern);
        allFiles = allFiles.concat(matches);
      }

      if (allFiles.length === 0) {
        throw new Error('No files found matching the provided patterns.');
      }

      console.log(`Analyzing ${allFiles.length} files...`);

      // 2. Initialize Generator
      const config = await loadConfig();
      const provider = createProvider(config);
      const generator = new SchemaGenerator(provider);

      // 3. Generate Schema
      const analysis = await generator.generateSchema(allFiles);

      // 4. Present to User
      console.log('\n--- Proposed Schema ---');
      console.log(`Recommended Name: ${analysis.recommendedName}`);
      console.table(analysis.fields.map(f => ({
        Name: f.name,
        Type: f.type,
        Required: f.required ? 'Yes' : 'No',
        Description: f.description
      })));
      console.log('-----------------------\n');

      // 5. Confirm Save
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => rl.question('Save this schema? [y/N] ', resolve));
      rl.close();

      if (answer.toLowerCase() === 'y') {
        // Construct full definition
        const schemaDefinition = {
          name: analysis.recommendedName,
          tableName: analysis.tableName,
          fields: analysis.fields,
          jsonSchema: analysis.jsonSchema,
          systemPrompt: analysis.systemPrompt,
          userPromptTemplate: analysis.userPromptTemplate
        };

        const schema = await SchemaManager.createSchema(schemaDefinition);
        console.log('\nSchema saved successfully!');
        console.log(`ID: ${schema.id}`);
        console.log(`Table: ${schema.tableName}`);
      } else {
        console.log('Schema discarded.');
      }

    } catch (error) {
      formatError(error);
      process.exit(1);
    }
  });

schemaCommand
  .command('list')
  .description('List all custom schemas')
  .action(async () => {
    try {
      const schemas = await SchemaManager.listSchemas();
      if (schemas.length === 0) {
        console.log('No custom schemas found.');
        return;
      }
      console.table(schemas.map(s => ({
        ID: s.id,
        Name: s.name,
        Table: s.table_name,
        Created: s.created_at
      })));
    } catch (error) {
      formatError(error);
      process.exit(1);
    }
  });

module.exports = schemaCommand;
