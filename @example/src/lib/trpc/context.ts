import { db } from '$lib/server/db';
import type { RequestEvent } from '@sveltejs/kit';

export async function createContext(event: RequestEvent) {
	return {
		event, // 👈 `event` is now available in your context
		db,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
