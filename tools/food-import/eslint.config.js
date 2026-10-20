import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
  {
    // Tests index into query results they have just asserted on; a failed assertion is the better error.
    files: ['test/**/*.ts', 'src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_' }],
    },
  },
);
