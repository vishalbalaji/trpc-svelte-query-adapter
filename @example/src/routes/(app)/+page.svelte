<script lang="ts">
	import { page } from '$app/stores';
	import { trpc } from '$lib/trpc/client';

	const api = trpc($page);
	const todosQuery = api.todos.getAll.createQuery();
</script>

{#if $todosQuery.isPending}
	Loading...
{:else if $todosQuery.isError}
	ERROR: {$todosQuery.error}
{:else if $todosQuery.data}
	<h1>Todos</h1>
	<ul>
		{#each $todosQuery.data as todo}
			<li>{todo.text}</li>
		{/each}
	</ul>
{/if}
