import { trpc } from '$lib/trpc/client.js';

export async function load(event) {
	const { queryClient } = await event.parent();
	const api = trpc(event, queryClient);

	return {
		api,
		todos: await api.todos.get.createServerQuery(),

		popularTodos: await api.todos.getPopular.createServerInfiniteQuery(
			{},
			{
				getNextPageParam: (data) => data.nextCursor,
			}
		),
	};
}
