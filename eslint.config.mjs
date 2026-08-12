import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const LOCAL_DATE_ACCESSORS = [
    'getFullYear',
    'getMonth',
    'getDate',
    'getDay',
    'getHours',
    'getMinutes',
    'getSeconds',
];

export default tseslint.config(
    { ignores: ['dist/', 'coverage/', 'node_modules/'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts'],
        ignores: ['**/*.test.ts', 'src/schedule/**/*.ts'],
        rules: {
            'no-restricted-globals': [
                'error',
                { name: 'setTimeout', message: 'Timers belong in src/schedule only.' },
                { name: 'setInterval', message: 'Timers belong in src/schedule only.' },
            ],
            'no-restricted-imports': ['error', { patterns: ['node:*', 'cron-parser'] }],
            'no-restricted-properties': [
                'error',
                { object: 'Date', property: 'now', message: 'Schedules never read a clock.' },

                ...LOCAL_DATE_ACCESSORS.map(property => ({
                    property,
                    message: `Use ${property.replace('get', 'getUTC')} — local time is never correct here.`,
                })),
            ],
        },
    },
    {
        files: ['**/*.test.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
        },
    },
    {
        files: ['scripts/**/*.mjs'],
        languageOptions: {
            globals: {
                console: 'readonly',
                process: 'readonly',
                URL: 'readonly',
            },
        },
    },
    prettier
);
