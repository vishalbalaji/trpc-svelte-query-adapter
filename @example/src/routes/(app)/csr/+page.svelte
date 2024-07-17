<script lang="ts">
	import Heading from '$lib/components/Heading.svelte';

	import { X } from 'phosphor-svelte';

	import { page } from '$app/stores';
	import { trpc } from '$lib/trpc/client';

	const api = trpc($page);
	const utils = api.createUtils();

	let todoInput: HTMLInputElement;

	const todos = api.todos.getAll.createQuery();
	const createTodo = api.todos.create.createMutation({
		onSuccess() {
			utils.todos.invalidate();
			todoInput.value = '';
		},
	});
	const deleteTodo = api.todos.delete.createMutation({
		onSuccess: () => {
			utils.todos.invalidate();
		},
	});
	const updateTodo = api.todos.update.createMutation({
		onSuccess: () => {
			utils.todos.invalidate();
		},
	});
</script>

<div
	style="display:flex;flex-direction:column;width:100%;height:100%;gap:2rem;"
>
	<Heading>Client-Side Rendering</Heading>

	<div style="width:100%;height:100%;">
		<h1>Todos</h1>

		<form
			action="#"
			on:submit|preventDefault={async (e) => {
				// @ts-expect-error - ??
				const { text } = e.currentTarget.elements;
				$createTodo.mutate(text.value);
			}}
		>
			<!-- eslint-disable-next-line svelte/valid-compile -->
			<!-- svelte-ignore a11y-no-redundant-roles -->
			<fieldset role="group" style="margin: 0">
				<input
					bind:this={todoInput}
					placeholder="Ex: Do shopping"
					aria-invalid={$createTodo.isError || undefined}
					disabled={$todos.isPending || $createTodo.isPending}
					name="text"
					type="text"
				/>
				<input
					disabled={$todos.isPending || $createTodo.isPending}
					type="submit"
					value="Create Todo"
				/>
			</fieldset>

			{#if $createTodo.isError}
				<div style="margin-top:0.5rem">
					{#each JSON.parse($createTodo.error.message) as error}
						<span style="color:var(--pico-color-red-450)">
							Error: {error.message}
						</span>
					{/each}
				</div>
			{/if}
		</form>

		<hr />

		{#if $todos.isPending}
			<article>
				<progress />
				Loading todos...
			</article>
		{:else if $todos.isError}
			<article>
				Error loading todos: {$todos.error}
			</article>
		{:else if $todos.data.length <= 0}
			<article style="text-align:center">Create a new Todo!</article>
		{:else}
			{#each $todos.data as todo}
				<article style="display:flex;align-items:center;gap:0.5rem;">
					<input
						type="checkbox"
						disabled={$todos.isPending || $createTodo.isPending}
						checked={todo.done}
						on:change|preventDefault={() => {
							$updateTodo.mutate({ id: todo.id, done: !todo.done });
						}}
					/>

					<span>
						{#if todo.done}
							<s>{todo.text}</s>
						{:else}
							{todo.text}
						{/if}
					</span>

					<button
						on:click|preventDefault={() => {
							$deleteTodo.mutate(todo.id);
						}}
						data-tooltip="Delete Todo"
						disabled={$todos.isPending || $createTodo.isPending}
						class="outline contrast pico-color-red-450"
						style="margin-left:auto;padding:0.1rem;line-height:1;border-color:var(--pico-color-red-450);display:grid;place-items:center;"
						><X /></button
					>
				</article>
			{/each}
		{/if}
		{#if $createTodo.isPending || $deleteTodo.isPending || $updateTodo.isPending}
			<progress />
		{/if}
	</div>
</div>
