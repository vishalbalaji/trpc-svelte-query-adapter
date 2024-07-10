import type { Context } from '$lib/trpc/context';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.context<Context>().create();

export const router = t.router({
	greeting: t.procedure
		.input(z.string().optional())
		.query(async ({ input }) => {
			await new Promise((r) => setTimeout(r, 500));
			return `Hello ${input ?? 'tRPC'} v10 @ ${new Date().toLocaleTimeString()}`;
		})
});

export const createCaller = t.createCallerFactory(router);

export type Router = typeof router;
