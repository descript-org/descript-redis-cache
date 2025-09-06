// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.stylistic,
    {
        plugins: {
            '@stylistic': stylistic,
        },
        rules: {
            'no-console': 'error',
            '@typescript-eslint/consistent-type-imports': [ 'error' ],
            '@stylistic/comma-dangle': [ 'error', 'always-multiline' ],
            '@stylistic/indent': [ 'error', 4 ],
            '@stylistic/object-curly-spacing': [ 'error', 'always' ],
            '@stylistic/quote-props': [ 'error', 'as-needed', {
                keywords: true,
                numbers: true,
            } ],
            '@stylistic/quotes': [ 'error', 'single', {
                allowTemplateLiterals: 'always',
            } ],
            '@stylistic/semi': [ 'error', 'always' ],
        },
    },
);
