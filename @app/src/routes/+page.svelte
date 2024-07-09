<script lang="ts">
	import { page } from '$app/stores';
	import { trpc } from '$lib/trpc/client';

	const api = trpc($page);

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const query = api.greeting.createQuery();
</script>

<!-- {#if $query.isPending} -->
<!-- 	Loading... -->
<!-- {:else if $query.isError} -->
<!-- 	Error: {$query.error.message} -->
<!-- {:else if $query.data} -->
<!-- 	{$query.data} -->
<!-- {/if} -->
