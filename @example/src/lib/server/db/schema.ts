import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const todo = sqliteTable('todo', {
	id: integer('id').primaryKey(),
	text: text('text').notNull(),
	done: integer('done', { mode: 'boolean' }),
});
