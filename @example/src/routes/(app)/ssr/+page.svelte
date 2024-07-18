<script lang="ts">
	import Heading from '$lib/components/Heading.svelte';

	import { X, Plus } from 'phosphor-svelte';

	export let data;

	const { api } = data;
	const utils = api.createUtils();

	let todoInput: HTMLInputElement;

	const todos = data.todos();
	const popularTodos = data.popularTodos();

	const createTodo = api.todos.create.createMutation({
		onSuccess() {
			utils.todos.get.invalidate();
			todoInput.value = '';
		},
	});
	const deleteTodo = api.todos.delete.createMutation({
		onSuccess: () => {
			utils.todos.get.invalidate();
		},
	});
	const updateTodo = api.todos.update.createMutation({
		onSuccess: () => {
			utils.todos.get.invalidate();
		},
	});
</script>

<Heading>Client-only</Heading>

<div id="content" style="margin-top:2rem">
	<div>
		<h2>Todos</h2>

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
			<div style="max-height:70vh;overflow:hidden;overflow-y:auto">
				{#each $todos.data as todo}
					<article style="display:flex;align-items:center;gap:0.5rem;">
						<input
							title={`Mark as ${todo.done ? 'Not Done' : 'Done'}`}
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
							title="Delete Todo"
							disabled={$todos.isPending || $createTodo.isPending}
							class="outline contrast pico-color-red-450"
							style="margin-left:auto;padding:0.1rem;line-height:1;border-color:var(--pico-color-red-450);display:grid;place-items:center;"
						>
							<X />
						</button>
					</article>
				{/each}
			</div>
		{/if}
		{#if $createTodo.isPending || $deleteTodo.isPending || $updateTodo.isPending}
			<progress />
		{/if}
	</div>

	<div>
		<h2>Popular Todos (not really)</h2>
		<button
			on:click|preventDefault={() => $popularTodos.fetchNextPage()}
			class="outline"
			style="display:block;margin-left:auto"
		>
			Fetch more
		</button>
		<hr />

		{#if $popularTodos.isPending || $popularTodos.isFetching}
			<article>
				<progress />
				Loading popular todos...
			</article>
		{:else if $popularTodos.isError}
			<article>
				Error loading todos: {$popularTodos.error}
			</article>
		{:else if $popularTodos.data}
			<div style="max-height:70vh;overflow:hidden;overflow-y:auto">
				{#each $popularTodos.data?.pages.flatMap((page) => page.todos) as todo}
					<article
						style="display:flex;align-items:center;justify-content:space-between;"
					>
						<span>
							{todo.id}: {todo.title}
						</span>

						<button
							on:click|preventDefault={() => {
								$createTodo.mutate(todo.title);
							}}
							title="Add Todo"
							disabled={$popularTodos.isPending || $createTodo.isPending}
							class="outline contrast pico-color-green-450"
							style="margin-left:auto;padding:0.1rem;line-height:1;border-color:var(--pico-color-green-450);display:grid;place-items:center;"
						>
							<Plus />
						</button>
					</article>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	#content {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
	}

	@media (min-width: 1024px) {
		#content {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
