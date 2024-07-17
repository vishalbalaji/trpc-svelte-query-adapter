import type { Context } from '$lib/trpc/context';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

import { todo } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const t = initTRPC.context<Context>().create();

export const router = t.router({
	todos: t.router({
		create: t.procedure
			.input(z.string().min(1, 'Todo text cannot be empty'))
			.mutation(async ({ input: text, ctx: { db } }) => {
				await new Promise((r) => setTimeout(r, 2000));
				return (await db.insert(todo).values({ text }).returning())?.[0];
			}),

		getAll: t.procedure.query(({ ctx: { db } }) => db.query.todo.findMany()),
		getOne: t.procedure
			.input(z.number())
			.query(({ input: id, ctx: { db } }) =>
				db.query.todo.findFirst({ where: (t, { eq }) => eq(t.id, id) })
			),

		update: t.procedure
			.input(
				z.object({
					id: z.number(),
					text: z.string().min(1).optional(),
					done: z.boolean().optional(),
				})
			)
			.mutation(({ input: { id, ...newTodo }, ctx: { db } }) =>
				db.update(todo).set(newTodo).where(eq(todo.id, id))
			),

		delete: t.procedure
			.input(z.number())
			.mutation(({ input: id, ctx: { db } }) =>
				db
					.delete(todo)
					.where(eq(todo.id, id))
					.returning()
					.then((r) => r?.[0])
			),
	}),
});

export const createCaller = t.createCallerFactory(router);

export type Router = typeof router;
