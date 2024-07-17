<script lang="ts">
	import '@picocss/pico';
	import '@picocss/pico/css/pico.colors.css';
	import '@fontsource-variable/inter';

	import { QueryClientProvider } from '@tanstack/svelte-query';
	import type { LayoutData } from './$types';

	export let data: LayoutData;
</script>

<QueryClientProvider client={data.queryClient}>
	<main class="container">
		<slot />
	</main>
</QueryClientProvider>

<style>
	:global(*) {
		font-family: 'Inter Variable', sans-serif !important;
	}

	:global(body) {
		width: 100vw;
		height: 100vh;
	}

	main.container {
		width: 100%;
		height: 100%;
		padding: 1rem;
	}
</style>
