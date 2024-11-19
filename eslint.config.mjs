// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylisticTs from '@stylistic/eslint-plugin-ts';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.stylistic,
    {
        plugins: {
            '@stylistic/ts': stylisticTs,
        },
        rules: {
            'no-console': 'error',
            '@typescript-eslint/consistent-type-imports': [ 'error' ],
            '@stylistic/ts/comma-dangle': [ 'error', 'always-multiline' ],
            '@stylistic/ts/indent': [ 'error', 4 ],
            '@stylistic/ts/object-curly-spacing': [ 'error', 'always' ],
            '@stylistic/ts/quote-props': [ 'error', 'as-needed', {
                keywords: true,
                numbers: true,
            } ],
            '@stylistic/ts/quotes': [ 'error', 'single', {
                allowTemplateLiterals: true,
            } ],
            '@stylistic/ts/semi': [ 'error', 'always' ],
        },
    },
);
