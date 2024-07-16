import shared from 'shared/prettier';

/** @type {import('prettier').Config} */
export default {
	...shared,
	plugins: ['prettier-plugin-svelte'],
	overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }],
};
