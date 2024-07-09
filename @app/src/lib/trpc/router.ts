import type { Context } from '$lib/trpc/context';
import { initTRPC } from '@trpc/server';

export const t = initTRPC.context<Context>().create();

export const router = t.router({
	greeting: t.procedure.query(async () => {
		await new Promise((r) => setTimeout(r, 500));
		return `Hello tRPC v10 @ ${new Date().toLocaleTimeString()}`;
	})
});

export const createCaller = t.createCallerFactory(router);

export type Router = typeof router;
