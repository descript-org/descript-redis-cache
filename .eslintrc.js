module.exports = {
    'env': {
        'es6': true,
        'node': true,
    },
    'extends': [
        'eslint:recommended',
    ],
    'rules': {
        'array-bracket-spacing': [ 'error', 'always' ],
        'comma-dangle': [ 'error', 'always-multiline' ],
        'eol-last': 'error',
        'indent': [ 'error', 4 ],
        'linebreak-style': [ 'error', 'unix' ],
        'no-empty': [ 'error', { 'allowEmptyCatch': true } ],
        'no-multiple-empty-lines': [ 'error', { 'max': 1, 'maxBOF': 0 } ],
        'no-var': [ 'error' ],
        'object-curly-spacing': [ 'error', 'always' ],
        'quotes': [ 'error', 'single' ],
        'semi': [ 'error', 'always' ],
        'space-infix-ops': 'error',
    },
};
