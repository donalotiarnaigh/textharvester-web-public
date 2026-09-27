import globals from 'globals';
import pluginJs from '@eslint/js';
import pluginJest from 'eslint-plugin-jest';

export default [
  {
    // The public-mirror export is a copy of this repository; linting it would
    // double every report. See scripts/export-public-mirror.js.
    ignores: ['.mirror-export/', 'coverage/'],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest, // Add Jest globals
        // Add browser library globals
        ClipboardJS: 'readonly',
        bootstrap: 'readonly',
        $: 'readonly', // jQuery
      },
    },
  },
  pluginJs.configs.recommended,
  {
    plugins: {
      jest: pluginJest,
    },
    rules: {
      ...pluginJest.configs.recommended.rules,
      indent: ['error', 2],
      'linebreak-style': ['error', 'unix'],
      quotes: ['error', 'single'], // Enforce single quotes
      semi: ['error', 'always'],
      'no-unused-vars': ['warn'],
    },
  },
];
