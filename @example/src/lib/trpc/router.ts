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
				return db
					.insert(todo)
					.values({ text })
					.returning()
					.then((r) => r[0]);
			}),

		get: t.procedure.query(({ ctx: { db } }) => db.query.todo.findMany()),

		getPopular: t.procedure
			.input(
				z.object({
					cursor: z.number().optional(),
					limit: z.number().optional(),
				})
			)
			.query(async ({ input: { cursor: start = 0, limit = 10 } }) => {
				const res = await fetch(
					`https://jsonplaceholder.typicode.com/todos?_start=${start}&_limit=${limit}`
				);
				const todos = (await res.json()) as {
					userId: number;
					id: number;
					title: string;
					completed: boolean;
				}[];

				return { todos, nextCursor: start + limit };
			}),

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
