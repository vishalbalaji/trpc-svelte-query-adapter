import DeepProxy from 'proxy-deep';

import type { TRPCClientError } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import type { createTRPCClient, TRPCClientInit } from 'trpc-sveltekit';

import {
	useQueryClient,
	createQuery,
	createMutation,
	createInfiniteQuery,
	CreateQueryOptions,
	CreateMutationOptions,
	CreateInfiniteQueryOptions,
	InvalidateQueryFilters,
	FetchQueryOptions,
	FetchInfiniteQueryOptions,
	InfiniteData,
	RefetchQueryFilters,
	RefetchOptions,
	ResetOptions,
	CancelOptions,
	Updater,
	SetDataOptions,
} from '@tanstack/svelte-query';

const ProcedureNames = {
	query: 'useQuery',
	infiniteQuery: 'useInfiniteQuery',
	mutate: 'useMutation',
	subscribe: 'useSubscription',
	queryKey: 'getQueryKey',
	context: 'useContext',
} as const

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

type AddQueryPropTypes<TClient, TError> = {
	[K in keyof TClient]:
	TClient[K] extends { query: any } ? QueryProcedures<Parameters<TClient[K]['query']>[0], ReturnType<TClient[K]['query']>, TError>
	: TClient[K] extends { mutate: any } ? UseMutationProcedure<Parameters<TClient[K]['mutate']>[0], ReturnType<TClient[K]['mutate']>, TError>
	: TClient[K] extends { subscribe: any } ? UseSubscriptionProcedure<Parameters<TClient[K]['subscribe']>[0], ReturnType<TClient[K]['subscribe']>, TError>
	: AddQueryPropTypes<TClient[K], TError> & GetQueryKey
};

const ContextProcedureNames = {
	client: 'client',
	fetch: 'fetch',
	prefetch: 'prefetch',
	fetchInfinite: 'fetchInfinite',
	prefetchInfinite: 'prefetchInfinite',
	invalidate: 'invalidate',
	refetch: 'refetch',
	reset: 'reset',
	cancel: 'cancel',
	setData: 'setData',
	getData: 'getData',
	setInfiniteData: 'setInfiniteData',
	getInfiniteData: 'getInfiniteData',
} as const

type ContextProcedures<TInput = undefined, TOutput = undefined, TError = undefined> = {
	[ContextProcedureNames.fetch](input: TInput, opts?: FetchQueryOptions<TInput, TError, TOutput>): Promise<TOutput>
	[ContextProcedureNames.prefetch](input: TInput, opts?: FetchQueryOptions<TInput, TError, TOutput>): Promise<void>
	[ContextProcedureNames.fetchInfinite](input: TInput, opts?: FetchInfiniteQueryOptions<TInput, TError, TOutput>): Promise<InfiniteData<TOutput>>
	[ContextProcedureNames.prefetchInfinite](input: TInput, opts?: FetchInfiniteQueryOptions<TInput, TError, TOutput>): Promise<void>
	[ContextProcedureNames.invalidate](input?: TInput, filters?: InvalidateQueryFilters): Promise<void>
	[ContextProcedureNames.refetch](input?: TInput, filters?: RefetchQueryFilters, opts?: RefetchOptions): Promise<void>
	[ContextProcedureNames.reset](input?: TInput, opts?: ResetOptions): Promise<void>
	[ContextProcedureNames.cancel](input?: TInput, opts?: CancelOptions): Promise<void>
	[ContextProcedureNames.setData](input: TInput, updater: Updater<TOutput | undefined, TOutput | undefined>, opts?: SetDataOptions): void
	[ContextProcedureNames.getData](): Promise<void>
	[ContextProcedureNames.setInfiniteData](): Promise<void>
	[ContextProcedureNames.getInfiniteData](): Promise<void>
}

// CREDIT: https://stackoverflow.com/questions/63447660
type WithNevers<T, V> = { [K in keyof T]:
	Exclude<T[K], undefined> extends V ? never
	: T[K] extends Record<string, unknown> ? Without<T[K], V>
	: T[K]
}
type Without<T, V, I = WithNevers<T, V>> = Pick<I, { [K in keyof I]: I[K] extends never ? never : K }[keyof I]>

type AddContextPropTypes<TClient, TError> = {
	[K in keyof TClient]:
	TClient[K] extends { query: any } ? ContextProcedures<Parameters<TClient[K]['query']>[0], Awaited<ReturnType<TClient[K]['query']>>, TError>
	: AddContextPropTypes<TClient[K], TError> & Pick<ContextProcedures, typeof ContextProcedureNames.invalidate>
};

type UseContext<T, TError> = AddContextPropTypes<Without<T, { mutate: any } | { subscribe: any }>, TError>
	& Pick<ContextProcedures, typeof ContextProcedureNames.invalidate>
	& { [ContextProcedureNames.client]: T }

function createUseContextProxy(client: any) {
	const queryClient = useQueryClient();
	return new DeepProxy({}, {
		get(_target, key, _receiver) {
			if (key === ContextProcedureNames.client) return client;

			return this.nest(() => { })
		},

		apply(_target, _thisArg, argList) {
			const utilName = this.path.pop()

			// TODO: should probably replace `reduce` with `for...of` for better performance
			const target = [...this.path].reduce((client, value) => client[value], client) as any
			const [input, ...opts] = argList

			if (utilName === ContextProcedureNames.invalidate) {
				const filters = opts[0]

				return queryClient.invalidateQueries({ ...filters, queryKey: getArrayQueryKey(this.path, input, 'any') });
			} else if (utilName === ContextProcedureNames.fetch) {
				return queryClient.fetchQuery({
					...opts,
					queryKey: getArrayQueryKey(this.path, input, 'query'),
					queryFn: () => target.query(input),
				});
			} else if (utilName === ContextProcedureNames.fetchInfinite) {
				return queryClient.fetchInfiniteQuery({
					...opts,
					queryKey: getArrayQueryKey(this.path, input, 'infinite'),
					queryFn: () => target.query(input),
				});
			} else if (utilName === ContextProcedureNames.prefetch) {
				return queryClient.prefetchQuery({
					...opts,
					queryKey: getArrayQueryKey(this.path, input, 'query'),
					queryFn: () => target.query(input),
				});
			} else if (utilName === ContextProcedureNames.prefetchInfinite) {
				return queryClient.prefetchInfiniteQuery({
					...opts,
					queryKey: getArrayQueryKey(this.path, input, 'infinite'),
					queryFn: () => target.query(input),
				});
			} else if (utilName === ContextProcedureNames.refetch) {
				return queryClient.refetchQueries(
					getArrayQueryKey(this.path, input, 'any'),
					...opts
				);
			} else if (utilName === ContextProcedureNames.reset) {
				return queryClient.resetQueries(
					getArrayQueryKey(this.path, input, 'any'),
					...opts
				)
			} else if (utilName === ContextProcedureNames.cancel) {
				return queryClient.cancelQueries(
					getArrayQueryKey(this.path, input, 'any'),
					...opts
				)
			} else if (utilName === ContextProcedureNames.setData) {
				return queryClient.setQueryData(
					getArrayQueryKey(this.path, input, 'query'),
					...opts as [any]
				)
			}

			// Just simulating the error gotten from tRPC for now.
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

		type ClientWithQuery = AddQueryPropTypes<Client, RouterError> & { useContext(): UseContext<Client, RouterError>, useQueries: unknown }
		return new DeepProxy({} as ClientWithQuery, {
			get() {
				return this.nest(() => { })
			},

			apply(_target, _thisArg, argList) {
				const procedure = this.path.pop()

				// TODO: should probably replace `reduce` with `for...of` for better performance
				const target = [...this.path].reduce((client, value) => client[value], client as Record<string, any>)
				const [input, ...opts] = argList

				if (procedure === ProcedureNames.query) {
					return createQuery({
						...opts,
						queryKey: getArrayQueryKey(this.path, input, 'query'),
						queryFn: () => (target as any).query(input),
					})
				} else if (procedure === ProcedureNames.infiniteQuery) {
					return createInfiniteQuery({
						...opts,
						queryKey: getArrayQueryKey(this.path, input, 'infinite'),
						queryFn: () => (target as any).query(input),
					})
				} else if (procedure === ProcedureNames.mutate) {
					return createMutation({
						...opts,
						mutationKey: this.path,
						mutationFn: () => (target as any).mutate(input),
					})
				} else if (procedure === ProcedureNames.queryKey) {
					// NOTE: should probably throw error for procedures
					// like `useMutation` that don't have `getQueryKey`,
					// but it is not handled in `@trpc/react-query` either.
					return getArrayQueryKey(
						this.path,
						input,
						...opts as [any]
					)
				} else if (procedure === ProcedureNames.context) {
					return createUseContextProxy(client)
				}

				return target[procedure as string].call();
			}
		});
	};
};
