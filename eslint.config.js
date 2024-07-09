import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';


/** @type import("eslint").Linter.FlatConfig **/
export default [
	{ files: ['**/*.{js,mjs,cjs,ts}'] },
	{ languageOptions: { globals: { ...globals.browser, ...globals.node } } },
	pluginJs.configs.recommended,
	...tseslint.configs.recommended,
	{
		rules: {
			indent: [
				'warn',
				'tab',
			],
			quotes: [
				'warn',
				'single',
			],
			semi: [
				'warn',
				'always',
			],
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
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/ban-types': 'off',
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
		},
	},
];
