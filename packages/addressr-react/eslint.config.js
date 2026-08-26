import rootConfig from '../../eslint.ui.config.js';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...rootConfig,
  {
    files: ['**/*.{ts,tsx,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
];
