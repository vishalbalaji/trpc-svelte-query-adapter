import type { Context } from '$lib/trpc/context';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

import { todo } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const t = initTRPC.context<Context>().create();

export const router = t.router({
	todos: t.router({
		getAll: t.procedure
			.query(({ ctx: { db } }) => db.query.todo.findMany()),
		getOne: t.procedure
			.input(z.number())
			.query(({ input: id, ctx: { db } }) => db.query.todo.findFirst({ where: (t, { eq }) => eq(t.id, id) })),

		create: t.procedure
			.input(z.string())
			.mutation(({ input: text, ctx: { db } }) => db.insert(todo).values({ text })),

		update: t.procedure
			.input(z.object({ id: z.number(), text: z.string().optional(), done: z.boolean().optional() }))
			.mutation(({ input: { id, ...newTodo }, ctx: { db } }) => db.update(todo).set(newTodo).where(eq(todo.id, id))),
	}),
});

export const createCaller = t.createCallerFactory(router);

export type Router = typeof router;
