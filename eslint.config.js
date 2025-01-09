const js = require('@eslint/js');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');
const mochaPlugin = require('eslint-plugin-mocha');
const globals = require('globals');

module.exports = [
    {
        ignores: ['build/']
    },
    js.configs.recommended,
    eslintPluginPrettierRecommended,
    mochaPlugin.configs.flat.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.node
            },
            ecmaVersion: 2020,
            sourceType: 'commonjs'
        },
        rules: {
            'mocha/no-mocha-arrows': 'off'
        }
    }
];
