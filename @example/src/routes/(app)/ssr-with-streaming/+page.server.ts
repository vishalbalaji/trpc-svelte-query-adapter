import { createCaller } from '$lib/trpc/router';

export async function load(event) {
	const api = await createCaller(event);
	return {
		popularTodos: api.todos.getPopular({}),
		todos: await api.todos.get(),
	};
}
