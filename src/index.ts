import DeepProxy from 'proxy-deep';

import type { TRPCClientError } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import type { createTRPCClient, TRPCClientInit } from 'trpc-sveltekit';

import {
	createQuery,
	createMutation,
	createInfiniteQuery,
	type CreateQueryOptions,
	type CreateMutationOptions,
	type CreateInfiniteQueryOptions,
} from '@tanstack/svelte-query';

enum ProcedureNames {
	query = 'useQuery',
	infiniteQuery = 'useInfiniteQuery',
	mutate = 'useMutation',
	subscribe = 'useSubscription',
	queryKey = 'getQueryKey',
	context = 'useContext',
}

export type QueryType = 'query' | 'infinite' | 'any';

export type QueryKey = [
	string[],
	{ input?: unknown; type?: Exclude<QueryType, 'any'> }?,
];

function getArrayQueryKey(
	queryKey: string | [string] | [string, ...unknown[]] | unknown[],
	input: unknown,
	type: QueryType,
): QueryKey {
	const arrayPath = (typeof queryKey === 'string' ?
		queryKey === '' ? [] : queryKey.split('.')
		: queryKey) as [string]

	if (!input && (!type || type === 'any'))
		// for `utils.invalidate()` to match all queries (including vanilla react-query)
		// we don't want nested array if path is empty, i.e. `[]` instead of `[[]]`
		return arrayPath.length ? [arrayPath] : ([] as unknown as QueryKey);

	return [
		arrayPath,
		{
			...(typeof input !== 'undefined' && { input: input }),
			...(type && type !== 'any' && { type: type }),
		},
	];
}

type GetQueryKey<TInput = undefined> = {
	getQueryKey:
	TInput extends undefined
	? () => QueryKey
	: (input: TInput, type?: QueryType) => QueryKey
}

type UseQueryProcedure<TInput, TOutput, TError> = {
	[ProcedureNames.query]: (input: TInput, opts?: CreateQueryOptions<TOutput, TError>)
		=> ReturnType<typeof createQuery<Awaited<TOutput>, TError>>
}
type UseInfiniteQueryProcedure<TInput, TOutput, TError> = TInput extends { cursor?: any }
	? {
		[ProcedureNames.infiniteQuery]: (input: Omit<TInput, 'cursor'>, opts?: CreateInfiniteQueryOptions<TOutput, TError>)
			=> ReturnType<typeof createInfiniteQuery<Awaited<TOutput>, TError>>
	}
	: {}
type QueryProcedures<TInput, TOutput, TError> = UseQueryProcedure<TInput, TOutput, TError> & UseInfiniteQueryProcedure<TInput, TOutput, TError> & GetQueryKey<TInput>

type UseMutationProcedure<TInput, TOutput, TError> = {
	[ProcedureNames.mutate]: (input: TInput, opts?: CreateMutationOptions<TInput, TError>)
		=> ReturnType<typeof createMutation<Awaited<TOutput>, TError>>
}

type UseSubscriptionProcedure<TInput, TOutput, TError> = never

type AddQueryPropTypes<T, TError> = {
	[K in keyof T]:
	T[K] extends { query: any } ? QueryProcedures<Parameters<T[K]['query']>[0], ReturnType<T[K]['query']>, TError>
	: T[K] extends { mutate: any } ? UseMutationProcedure<Parameters<T[K]['mutate']>[0], ReturnType<T[K]['mutate']>, TError>
	: T[K] extends { subscribe: any } ? UseSubscriptionProcedure<Parameters<T[K]['subscribe']>[0], ReturnType<T[K]['subscribe']>, TError>
	: AddQueryPropTypes<T[K], TError> & GetQueryKey
} & {};

enum ContextProcedureNames {
	client = 'client',
	fetch = 'fetch',
	prefetch = 'prefetch',
	fetchInfinite = 'fetchInfinite',
	prefetchInfinite = 'prefetchInfinite',
	invalidate = 'invalidate',
	refetch = 'refetch',
	reset = 'reset',
	cancel = 'cancel',
	setData = 'setData',
	getData = 'getData',
	setInfiniteData = 'setInfiniteData',
	getInfiniteData = 'getInfiniteData',
}

type ContextProcedures = {
	[ContextProcedureNames.fetch](): unknown
	[ContextProcedureNames.prefetch](): unknown
	[ContextProcedureNames.fetchInfinite](): unknown
	[ContextProcedureNames.prefetchInfinite](): unknown
	[ContextProcedureNames.invalidate](): unknown
	[ContextProcedureNames.refetch](): unknown
	[ContextProcedureNames.reset](): unknown
	[ContextProcedureNames.cancel](): unknown
	[ContextProcedureNames.setData](): unknown
	[ContextProcedureNames.getData](): unknown
	[ContextProcedureNames.setInfiniteData](): unknown
	[ContextProcedureNames.getInfiniteData](): unknown
} & {}

type AddContextPropTypes<T> = {
	[K in keyof T as T[K] extends { mutate: any } | { subscribe: any } ? never : K]:
	T[K] extends { query: any } ? ContextProcedures
	: AddContextPropTypes<T[K]> & Pick<ContextProcedures, ContextProcedureNames.invalidate>
} & {};

type UseContext<T> = AddContextPropTypes<T> & Pick<ContextProcedures, ContextProcedureNames.invalidate> & { [ContextProcedureNames.client]: T }

function createGetContextProxy<TClient>(client: TClient) {
	return new DeepProxy({} as UseContext<TClient>, {
		get(_target, key, _receiver) {
			if (key === ContextProcedureNames.client) return client;

			return this.nest(() => { })
		},

		apply(_target, _thisArg, argList) {
			const utilName = this.path.pop()

			// TODO: should probably replace `reduce` with `for...of` for better performance
			const target = [...this.path].reduce((client, value) => client[value], client as Record<string, any>)
			const [input, ...args] = argList

			throw new TypeError('contextMap[utilName] is not a function');
		}
	})
}

export function svelteQueryWrapper<TRouter extends AnyRouter>(
	trpc: (init?: TRPCClientInit) => ReturnType<typeof createTRPCClient<TRouter>>
) {
	type RouterError = TRPCClientError<TRouter>

	return (init?: TRPCClientInit) => {
		const client = trpc(init);
		type Client = typeof client;

		type ClientWithQuery = AddQueryPropTypes<Client, RouterError> & { useContext(): UseContext<Client>, useQueries: unknown }
		return new DeepProxy({} as ClientWithQuery, {
			get() {
				return this.nest(() => { })
			},

			apply(_target, _thisArg, argList) {
				const procedure = this.path.pop()

				// TODO: should probably replace `reduce` with `for...of` for better performance
				const target = [...this.path].reduce((client, value) => client[value], client as Record<string, any>)
				const [input, ...args] = argList

				if (procedure === ProcedureNames.query) {
					return createQuery(
						getArrayQueryKey(this.path, input, 'query'), () => (target['query'] as (args: any[]) => any)(input), ...args
					)
				} else if (procedure === ProcedureNames.infiniteQuery) {
					return createInfiniteQuery(
						getArrayQueryKey(this.path, input, 'infinite'), () => (target['query'] as (args: any[]) => any)(input), ...args
					)
				} else if (procedure === ProcedureNames.mutate) {
					return createMutation(this.path, () => (target['mutate'] as (args: any[]) => any)(input), ...args)
				} else if (procedure === ProcedureNames.queryKey) {
					// NOTE: should probably handle for procedures like `useMutation`
					// that don't have `getQueryKey`, but it is not handled
					// in `@trpc/react-query` either.
					return getArrayQueryKey(
						this.path,
						input,
						...args as [any]
					)
				} else if (procedure === ProcedureNames.context) {
					return createGetContextProxy(client)
				}

				return target[procedure as string].call();
			}
		});
	};
};
