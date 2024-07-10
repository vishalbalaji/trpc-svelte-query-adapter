import { trpc } from '$lib/trpc/client';

export async function load(event) {
	const { queryClient } = await event.parent();
	const api = trpc(event, queryClient);

	return {
		queries: await api.createServerQueries((t) => [t.greeting('foo'), t.greeting('bar')], {
			combine: (results) => ({
				data: results.map(({ data }) => data),
				pending: results.some(({ isPending }) => isPending)
			})
		})
	}
}
