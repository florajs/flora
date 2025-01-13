const js = require('@eslint/js');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');
const globals = require('globals');

module.exports = [
    {
        ignores: ['build/']
    },
    js.configs.recommended,
    eslintPluginPrettierRecommended,
    {
        languageOptions: {
            globals: {
                ...globals.node
            },
            ecmaVersion: 2020,
            sourceType: 'commonjs'
        }
    }
];
