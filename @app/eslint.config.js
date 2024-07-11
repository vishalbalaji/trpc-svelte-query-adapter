import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import shared from 'eslint-shared';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
	...shared,
	...svelte.configs['flat/recommended'],
	...svelte.configs['flat/prettier'],
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
			},
		},
	},
	{
		ignores: ['build/', '.svelte-kit/', 'dist/'],
	},
];
