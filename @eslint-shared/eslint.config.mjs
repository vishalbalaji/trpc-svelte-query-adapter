import js from '@eslint/js';
import ts from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** @type import('eslint').Linter.FlatConfig[] **/
export default [
	js.configs.recommended,
	...ts.configs.recommended,
	prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	{
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/ban-types': 'off',
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/no-unused-vars': 'off',

			indent: ['warn', 'tab'],
			quotes: ['warn', 'single'],
			semi: ['warn', 'always'],

			'comma-dangle': [
				'warn',
				{
					arrays: 'always-multiline',
					exports: 'always-multiline',
					functions: 'never',
					imports: 'always-multiline',
					objects: 'always-multiline',
				},
			],
		},
	},
];
