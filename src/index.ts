import DeepProxy from 'proxy-deep';

import type { TRPCClientErrorLike, CreateTRPCProxyClient } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';

import {
	useQueryClient,
	createQuery,
	createMutation,
	createInfiniteQuery,
	createQueries,
	type CreateQueryOptions,
	type CreateMutationOptions,
	type CreateInfiniteQueryOptions,
	type InvalidateQueryFilters,
	type FetchQueryOptions,
	type FetchInfiniteQueryOptions,
	type InfiniteData,
	type RefetchQueryFilters,
	type RefetchOptions,
	type ResetOptions,
	type CancelOptions,
	type Updater,
	type SetDataOptions,
	type QueryClient,
	type InvalidateOptions,
	type QueryFilters,
	type CreateQueryResult,
	type CreateInfiniteQueryResult,
	type CreateMutationResult,
} from '@tanstack/svelte-query';

import { onDestroy } from 'svelte';

// CREDIT: https://stackoverflow.com/a/63448246
type WithNevers<T, V> = { [K in keyof T]:
	Exclude<T[K], undefined> extends V ? never
	: T[K] extends Record<string, unknown> ? Without<T[K], V>
	: T[K]
}
type Without<T, V, I = WithNevers<T, V>> = Pick<I, { [K in keyof I]: I[K] extends never ? never : K }[keyof I]>

type HasQuery = { query: (...args: any[]) => any }
type HasMutate = { mutate: (...args: any[]) => any }
type HasSubscribe = { subscribe: (...args: any[]) => any }
type OnlyQueries<TClient> = Without<TClient, HasMutate | HasSubscribe>

// createUtils
const UtilsProcedureNames = {
	client: 'client',
	fetch: 'fetch',
	prefetch: 'prefetch',
	fetchInfinite: 'fetchInfinite',
	prefetchInfinite: 'prefetchInfinite',
	ensureData: 'ensureData',
	invalidate: 'invalidate',
	refetch: 'refetch',
	reset: 'reset',
	cancel: 'cancel',
	setData: 'setData',
	getData: 'getData',
	setInfiniteData: 'setInfiniteData',
	getInfiniteData: 'getInfiniteData',
} as const;

type UtilsProcedures<TInput = undefined, TOutput = undefined, TError = undefined> = {
	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchquery
	 */
	[UtilsProcedureNames.fetch](input: TInput, opts?: FetchQueryOptions<TInput, TError, TOutput>): Promise<TOutput>

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchinfinitequery
	 */
	[UtilsProcedureNames.fetchInfinite](input: TInput, opts?: FetchInfiniteQueryOptions<TInput, TError, TOutput>): Promise<InfiniteData<TOutput>>

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientprefetchquery
	 */
	[UtilsProcedureNames.prefetch](input: TInput, opts?: FetchQueryOptions<TInput, TError, TOutput>): Promise<void>

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientprefetchinfinitequery
	 */
	[UtilsProcedureNames.prefetchInfinite](input: TInput, opts?: FetchInfiniteQueryOptions<TInput, TError, TOutput>): Promise<void>

	/**
	 * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientensurequerydata
	 */
	[UtilsProcedureNames.ensureData](input?: TInput, opts?: FetchQueryOptions<TInput, TError, TOutput>): Promise<TOutput>

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientinvalidatequeries
	 */
	[UtilsProcedureNames.invalidate](input?: TInput, filters?: InvalidateQueryFilters, options?: InvalidateOptions): Promise<void>

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientrefetchqueries
	 */
	[UtilsProcedureNames.refetch](input?: TInput, filters?: RefetchQueryFilters, options?: RefetchOptions): Promise<void>

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientcancelqueries
	 */
	[UtilsProcedureNames.cancel](input?: TInput, filters?: QueryFilters, options?: CancelOptions): Promise<void>

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientresetqueries
	 */
	[UtilsProcedureNames.reset](input?: TInput, filters?: QueryFilters, options?: ResetOptions): Promise<void>

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientsetquerydata
	 */
	[UtilsProcedureNames.setData](input: TInput, updater: Updater<TOutput | undefined, TOutput | undefined>, options?: SetDataOptions): void

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientsetquerydata
	 */
	[UtilsProcedureNames.setInfiniteData](input: TInput, updater: Updater<InfiniteData<TOutput> | undefined, InfiniteData<TOutput> | undefined>, options?: SetDataOptions): void

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientgetquerydata
	 */
	[UtilsProcedureNames.getData](input?: TInput): TOutput | undefined

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientgetquerydata
	 */
	[UtilsProcedureNames.getInfiniteData](input?: TInput): InfiniteData<TOutput> | undefined
}

type AddUtilsPropTypes<TClient, TError> = {
	[K in keyof TClient]:
	TClient[K] extends HasQuery ? UtilsProcedures<Parameters<TClient[K]['query']>[0], Awaited<ReturnType<TClient[K]['query']>>, TError>
	: AddUtilsPropTypes<TClient[K], TError> & Pick<UtilsProcedures, typeof UtilsProcedureNames.invalidate>
};

type CreateUtils<TClient, TError> = AddUtilsPropTypes<OnlyQueries<TClient>, TError>
	& Pick<UtilsProcedures, typeof UtilsProcedureNames.invalidate>
	& { [UtilsProcedureNames.client]: TClient }


// createQueries
type CreateQueriesResult<TOpts extends any[]> = ReturnType<typeof createQueries<TOpts>>;
type CreateQueryOptionsForCreateQueries<TOutput, TError, TData> = Omit<CreateQueryOptions<TOutput, TError, TData>, 'context' | 'queryKey' | 'queryFn'>

type CreateQueriesRecord<TClient, TError> = { [K in keyof TClient]:
	TClient[K] extends HasQuery
	? <TOutput = Awaited<ReturnType<TClient[K]['query']>>, TData = TOutput>
		(input: Parameters<TClient[K]['query']>[0], opts?: CreateQueryOptionsForCreateQueries<TOutput, TError, TData>)
		=> CreateQueryOptionsForCreateQueries<TOutput, TError, TData>
	: CreateQueriesRecord<TClient[K], TError>
}

type CreateQueries<TClient, TError> = <TOpts extends CreateQueryOptionsForCreateQueries<any, any, any>[]>(
	queriesCallback: (t: CreateQueriesRecord<OnlyQueries<TClient>, TError>) => readonly [...TOpts]
) => CreateQueriesResult<TOpts>

// createServerQueries
type CreateQueryOptionsForCreateServerQueries<TOutput, TError, TData> = CreateQueryOptionsForCreateQueries<TOutput, TError, TData> & {
	ssr?: boolean
}

type CreateServerQueriesRecord<TClient, TError> = { [K in keyof TClient]:
	TClient[K] extends HasQuery
	? <TOutput = Awaited<ReturnType<TClient[K]['query']>>, TData = TOutput>
		(input: Parameters<TClient[K]['query']>[0], opts?: CreateQueryOptionsForCreateServerQueries<TOutput, TError, TData>)
		=> CreateQueryOptionsForCreateServerQueries<TOutput, TError, TData>
	: CreateQueriesRecord<TClient[K], TError>
}

type CreateServerQueries<TClient, TError> = <TOpts extends CreateQueryOptionsForCreateQueries<any, any, any>[]>(
	queriesCallback: (t: CreateServerQueriesRecord<OnlyQueries<TClient>, TError>) => readonly [...TOpts]
) => Promise<(queriesCallback?: (t: CreateQueriesRecord<OnlyQueries<TClient>, TError>, old: readonly [...TOpts]) => readonly [...TOpts]) => CreateQueriesResult<TOpts>>

// Procedures
const ProcedureNames = {
	query: 'createQuery',
	serverQuery: 'createServerQuery',
	infiniteQuery: 'createInfiniteQuery',
	serverInfiniteQuery: 'createServerInfiniteQuery',
	mutate: 'createMutation',
	subscribe: 'createSubscription',
	queryKey: 'getQueryKey',
	context: 'createContext',
	utils: 'createUtils',
	queries: 'createQueries',
	serverQueries: 'createServerQueries',
} as const;

type CreateTRPCQueryOptions<TOutput, TError, TData> = Omit<CreateQueryOptions<TOutput, TError, TData>, 'queryKey' | 'queryFn'>
type CreateTRPCServerQueryOptions<TOutput, TError, TData> = CreateTRPCQueryOptions<TOutput, TError, TData> & {
	ssr?: boolean
}

type TRPCQueryOpts = {
	trpc?: {
		abortOnUnmount?: boolean;
	},
};

type CreateQueryProcedure<TInput, TOutput, TError> = {
	[ProcedureNames.query]: <TData = TOutput>(input: TInput, opts?: CreateTRPCQueryOptions<TOutput, TError, TData> & TRPCQueryOpts)
		=> CreateQueryResult<TData, TError>,
	[ProcedureNames.serverQuery]: <TData = TOutput>(input: TInput, opts?: CreateTRPCServerQueryOptions<TOutput, TError, TData> & TRPCQueryOpts)
		=> Promise<(input?: TInput | ((old: TInput) => TInput)) => CreateQueryResult<TData, TError>>,
} & {}

type CreateTRPCInfiniteQueryOptions<TOutput, TError, TData> = Omit<CreateInfiniteQueryOptions<TOutput, TError, TData>, 'queryKey' | 'queryFn'>;
type CreateTRPCServerInfiniteQueryOptions<TOutput, TError, TData> = CreateTRPCInfiniteQueryOptions<TOutput, TError, TData> & {
	ssr?: boolean
}

export type ExtractCursorType<TInput> = TInput extends { cursor: any }
	? TInput['cursor']
	: unknown;

type InfiniteQueryOpts<TInput> = {
	initialCursor?: ExtractCursorType<TInput>;
}

type CreateInfiniteQueryProcedure<TInput, TOutput, TError> = (TInput extends { cursor?: any }
	? {
		[ProcedureNames.infiniteQuery]: <TData = TOutput>(input: Omit<TInput, 'cursor'>, opts?: CreateTRPCInfiniteQueryOptions<TOutput, TError, TData> & InfiniteQueryOpts<TInput> & TRPCQueryOpts)
			=> CreateInfiniteQueryResult<InfiniteData<TData>, TError>,
		[ProcedureNames.serverInfiniteQuery]: <TData = TOutput>(input: Omit<TInput, 'cursor'>, opts?: CreateTRPCServerInfiniteQueryOptions<TOutput, TError, TData> & InfiniteQueryOpts<TInput> & TRPCQueryOpts)
			=> Promise<(input?: TInput | ((old: TInput) => TInput)) => CreateInfiniteQueryResult<InfiniteData<TData>, TError>>,
	}
	: {}) & {}

type QueryProcedures<TInput, TOutput, TError> = GetQueryKey<TInput> & CreateQueryProcedure<TInput, TOutput, TError> & CreateInfiniteQueryProcedure<TInput, TOutput, TError>

type CreateMutationProcedure<TInput, TOutput, TError, TContext = unknown> = {
	[ProcedureNames.mutate]: (opts?: CreateMutationOptions<TOutput, TError, TInput, TContext>)
		=> CreateMutationResult<TOutput, TError, TInput, TContext>
} & {}

type CreateSubscriptionOptions<TOutput, TError> = {
	enabled?: boolean
	onStarted?: () => void
	onData: (data: TOutput) => void
	onError?: (err: TError) => void
}

type GetSubscriptionOutput<TOpts> = TOpts extends unknown & Partial<infer A>
	? A extends { onData: any }
	? Parameters<A['onData']>[0] : never
	: never

type CreateSubscriptionProcedure<TInput, TOutput, TError> = {
	[ProcedureNames.subscribe]: (input: TInput, opts?: CreateSubscriptionOptions<TOutput, TError>)
		=> void
} & {}

type AddQueryPropTypes<TClient, TError> = TClient extends Record<any, any> ? {
	[K in keyof TClient]:
	TClient[K] extends HasQuery ? QueryProcedures<Parameters<TClient[K]['query']>[0], Awaited<ReturnType<TClient[K]['query']>>, TError> & {}
	: TClient[K] extends HasMutate ? CreateMutationProcedure<Parameters<TClient[K]['mutate']>[0], Awaited<ReturnType<TClient[K]['mutate']>>, TError>
	: TClient[K] extends HasSubscribe ? CreateSubscriptionProcedure<Parameters<TClient[K]['subscribe']>[0], GetSubscriptionOutput<Parameters<TClient[K]['subscribe']>[1]>, TError>
	: GetQueryKey & AddQueryPropTypes<TClient[K], TError>
} : TClient;
// Implementation
function createQueriesProxy(client: any) {
	return new DeepProxy({}, {
		get() {
			return this.nest(() => { });
		},
		apply(_target, _thisArg, argList) {
			const target = [...this.path].reduce((client, value) => client[value], client);
			const [input, opts] = argList;

			return {
				...opts,
				queryKey: getArrayQueryKey(this.path, input, 'query'),
				queryFn: () => target.query(input),
			};
		},
	});
}

const utilsProcedures: Record<PropertyKey,
	(opts: {
		path: string[],
		queryClient: QueryClient,
		target: any
	}) => any> = {
		[UtilsProcedureNames.fetch]: ({ path, queryClient, target }) => {
			return (input: any, opts?: any) => {
				return queryClient.fetchQuery({
					...opts,
					queryKey: getArrayQueryKey(path, input, 'query'),
					queryFn: () => target.query(input),
				});
			};
		},
		[UtilsProcedureNames.prefetch]: ({ path, queryClient, target }) => {
			return (input: any, opts?: any) => {
				return queryClient.prefetchQuery({
					...opts,
					queryKey: getArrayQueryKey(path, input, 'query'),
					queryFn: () => target.query(input),
				});
			};
		},
		[UtilsProcedureNames.fetchInfinite]: ({ path, queryClient, target }) => {
			return (input: any, opts?: any) => {
				return queryClient.fetchInfiniteQuery({
					...opts,
					queryKey: getArrayQueryKey(path, input, 'infinite'),
					queryFn: ({ pageParam }: { pageParam: number }) => target.query({ ...input, cursor: pageParam }),
				});
			};
		},
		[UtilsProcedureNames.prefetchInfinite]: ({ path, queryClient, target }) => {
			return (input: any, opts?: any) => {
				return queryClient.prefetchInfiniteQuery({
					...opts,
					queryKey: getArrayQueryKey(path, input, 'infinite'),
					queryFn: ({ pageParam }: { pageParam: number }) => target.query({ ...input, cursor: pageParam }),
				});
			};
		},
		[UtilsProcedureNames.ensureData]: ({ path, queryClient, target }) => {
			return (input: any, opts?: any) => {
				return queryClient.ensureQueryData({
					...opts,
					queryKey: getArrayQueryKey(path, input, 'query'),
					queryFn: () => target.query(input),
				});
			};
		},
		[UtilsProcedureNames.invalidate]: ({ path, queryClient }) => {
			return (input?: any, filters?: any, options?: any) => {
				return queryClient.invalidateQueries({
					...filters,
					queryKey: getArrayQueryKey(path, input, 'any'),
				}, options);
			};
		},
		[UtilsProcedureNames.refetch]: ({ path, queryClient }) => {
			return (input?: any, filters?: any, options?: any) => {
				return queryClient.refetchQueries({
					...filters,
					queryKey: getArrayQueryKey(path, input, 'any'),
				}, options);
			};
		},
		[UtilsProcedureNames.cancel]: ({ path, queryClient }) => {
			return (input?: any, filters?: any, options?: any) => {
				return queryClient.cancelQueries(
					{
						...filters,
						queryKey: getArrayQueryKey(path, input, 'any'),
					},
					options
				);
			};
		},
		[UtilsProcedureNames.reset]: ({ queryClient, path }) => {
			return (input?: any, filters?: any, options?: any) => {
				return queryClient.resetQueries(
					{
						...filters,
						queryKey: getArrayQueryKey(path, input, 'any'),
					},
					options
				);
			};
		},
		[UtilsProcedureNames.setData]: ({ queryClient, path }) => {
			return (input: any, updater: any, options?: any) => {
				return queryClient.setQueryData(
					getArrayQueryKey(path, input, 'query'),
					updater,
					options
				);
			};
		},
		[UtilsProcedureNames.setInfiniteData]: ({ queryClient, path }) => {
			return (input: any, updater: any, options?: any) => {
				return queryClient.setQueryData(
					getArrayQueryKey(path, input, 'infinite'),
					updater,
					options
				);
			};
		},
		[UtilsProcedureNames.getData]: ({ queryClient, path }) => {
			return (input?: any) => {
				return queryClient.getQueryData(getArrayQueryKey(path, input, 'query'));
			};
		},
		[UtilsProcedureNames.getInfiniteData]: ({ queryClient, path }) => {
			return (input?: any) => {
				return queryClient.getQueryData(getArrayQueryKey(path, input, 'infinite'));
			};
		},
	};

function createUtilsProxy(client: any, queryClient: QueryClient) {
	return new DeepProxy({}, {
		get(_target, key, _receiver) {
			if (key === UtilsProcedureNames.client) return client;

			if (Object.hasOwn(utilsProcedures, key)) {
				const target = [...this.path].reduce((client, value) => client[value], client as Record<PropertyKey, any>);
				return utilsProcedures[key]({ path: this.path, target, queryClient });
			}

			return this.nest(() => { });
		},
	});
}

const procedures: Record<PropertyKey,
	(opts: {
		path: string[],
		target: any,
		queryClient: QueryClient,
		queriesProxy: () => any,
		utilsProxy: () => any
		abortOnUnmount?: boolean,
	}) => any>
	= {
		[ProcedureNames.queryKey]: ({ path }) => {
			return (input: any, opts?: any) => getArrayQueryKey(path, input, opts);
		},
		[ProcedureNames.query]: ({ path, target, abortOnUnmount }) => {
			const targetFn = target.query;

			return (input: any, opts?: any) => {
				const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;
				return createQuery({
					...opts,
					queryKey: getArrayQueryKey(path, input, 'query'),
					queryFn: ({ signal }) => targetFn(input, {
						...(shouldAbortOnUnmount && { signal }),
					}),
				});
			};
		},
		[ProcedureNames.serverQuery]: ({ path, target, queryClient, abortOnUnmount }) => {
			const targetFn = target.query;

			return async (input: any, opts?: any) => {
				const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;
				const query: FetchQueryOptions = {
					queryKey: getArrayQueryKey(path, input, 'query'),
					queryFn: ({ signal }) => targetFn(input, {
						...(shouldAbortOnUnmount && { signal }),
					}),
				};

				const cache = queryClient.getQueryCache().find({ queryKey: query.queryKey });
				const cacheNotFound = !cache?.state?.data;
				if (opts?.ssr !== false && cacheNotFound) {
					await queryClient.prefetchQuery(query);
				}

				return (newInput?: any) => {
					let newQuery = query;

					if (newInput) {
						let i = newInput;
						if (typeof newInput === 'function') i = newInput(input);
						newQuery = {
							queryKey: getArrayQueryKey(path, i, 'query'),
							queryFn: ({ signal }) => targetFn(i, {
								...(shouldAbortOnUnmount && { signal }),
							}),
						};
					}

					return createQuery({
						...opts,
						...newQuery,
						...(cacheNotFound ?
							{ refetchOnMount: opts?.refetchOnMount ?? false } : {}
						),
					});
				};
			};
		},
		[ProcedureNames.infiniteQuery]: ({ path, target, abortOnUnmount }) => {
			return (input: any, opts?: any) => {
				const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;
				return createInfiniteQuery({
					...opts,
					queryKey: getArrayQueryKey(path, input, 'infinite'),
					queryFn: ({ pageParam, signal }) => target.query({
						...input,
						cursor: pageParam ?? opts?.initialCursor,
						...(shouldAbortOnUnmount && { signal }),

					}),
				});
			};
		},
		[ProcedureNames.serverInfiniteQuery]: ({ path, target, queryClient, abortOnUnmount }) => {
			const targetFn = target.query;

			return async (input: any, opts?: any) => {
				const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;
				const query: Omit<FetchInfiniteQueryOptions, 'initialPageParam'> = {
					queryKey: getArrayQueryKey(path, input, 'infinite'),
					queryFn: ({ pageParam, signal }) => targetFn({
						...input,
						cursor: pageParam ?? opts?.initialCursor,
						...(shouldAbortOnUnmount && { signal }),
					}),
				};

				const cache = queryClient.getQueryCache().find({ queryKey: query.queryKey });
				const cacheNotFound = !cache?.state?.data;
				if (opts?.ssr !== false && cacheNotFound) {
					await queryClient.prefetchInfiniteQuery(query as any);
				}

				return (newInput?: any) => {
					let newQuery = query;

					if (newInput) {
						let i = newInput;
						if (typeof newInput === 'function') i = newInput(input);
						newQuery = {
							queryKey: getArrayQueryKey(path, i, 'infinite'),
							queryFn: ({ pageParam, signal }) => targetFn({
								...i,
								cursor: pageParam ?? opts?.initialCursor,
								...(shouldAbortOnUnmount && { signal }),
							}),
						};
					}

					return createInfiniteQuery({
						...opts,
						...newQuery,
						...(cacheNotFound ?
							{ refetchOnMount: opts?.refetchOnMount ?? false } : {}
						),
					});
				};
			};
		},
		[ProcedureNames.mutate]: ({ path, target }) => {
			return (opts?: any) => {
				return createMutation({
					...opts,
					mutationKey: path,
					mutationFn: (data) => target.mutate(data),
				});
			};
		},
		[ProcedureNames.subscribe]: ({ target }) => {
			return (input: any, opts?: any) => {
				const enabled = opts?.enabled ?? true;
				if (!enabled) return;

				let isStopped = false;
				const subscription = target.subscribe(input, {
					onStarted: () => {
						if (!isStopped) opts?.onStarted?.();
					},
					onData: (data: any) => {
						if (!isStopped) opts?.onData?.(data);
					},
					onError: (err: any) => {
						if (!isStopped) opts?.onError?.(err);
					},
				});

				return onDestroy(() => {
					isStopped = true;
					subscription.unsubscribe();
				});
			};
		},
		[ProcedureNames.queries]: ({ path, queriesProxy }) => {
			if (path.length !== 0) return;
			return (input: (...args: any[]) => any) => {
				const proxy = queriesProxy();
				return createQueries(input(proxy));
			};
		},
		[ProcedureNames.serverQueries]: ({ path, queriesProxy, queryClient }) => {
			if (path.length !== 0) return;
			const proxy = queriesProxy();

			return async (input: (...args: any[]) => any) => {
				const queries = await Promise.all(
					input(proxy).map(async (query: any) => {
						const cache = queryClient.getQueryCache().find(query.queryKey);
						const cacheNotFound = !cache?.state?.data;

						if (query.ssr !== false && cacheNotFound) {
							await queryClient.prefetchQuery(query);
						}

						return {
							...query,
							...(cacheNotFound ?
								{ refetchOnMount: query.refetchOnMount ?? false } : {}
							),
						};
					})
				);

				return (newInput?: (...args: any[]) => any) => {
					let newQueries = queries;
					if (newInput) newQueries = newInput(proxy, queries);
					return createQueries({ queries: newQueries });
				};
			};
		},
		[ProcedureNames.utils]: ({ path, utilsProxy }) => {
			if (path.length !== 0) return;
			return utilsProxy;
		},
		[ProcedureNames.context]: ({ path, utilsProxy }) => {
			if (path.length !== 0) return;
			return utilsProxy;
		},
	};

// getQueryKey
type QueryType = 'query' | 'infinite' | 'any';

type QueryKey = [
	string[],
	{ input?: unknown; type?: Exclude<QueryType, 'any'> }?,
];

function getArrayQueryKey(
	queryKey: string | [string] | [string, ...unknown[]] | unknown[],
	input: unknown,
	type: QueryType
): QueryKey {
	const arrayPath = (typeof queryKey === 'string' ?
		queryKey === '' ? [] : queryKey.split('.')
		: queryKey) as [string];

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

type GetQueryKey<TInput = undefined> = [TInput] extends [undefined | void]
	? {
		[ProcedureNames.queryKey]: () => QueryKey
	}
	: {
		/**
		 * Method to extract the query key for a procedure
		 * @param type - defaults to `any`
		 */
		[ProcedureNames.queryKey]: (input: TInput, type?: QueryType) => QueryKey
	} & {}



export function svelteQueryWrapper<TRouter extends AnyRouter>({
	client,
	queryClient,
	abortOnUnmount,
}: { client: CreateTRPCProxyClient<TRouter>, queryClient?: QueryClient, abortOnUnmount?: boolean }) {

	type Client = typeof client;
	type RouterError = TRPCClientErrorLike<TRouter>;
	type ClientWithQuery = AddQueryPropTypes<Client, RouterError>;

	const qc = queryClient ?? useQueryClient();

	return new DeepProxy({} as ClientWithQuery & (
		ClientWithQuery extends Record<any, any> ?
		{
			/**
			 * @deprecated renamed to `createUtils` and will be removed in a future tRPC version
			 *
			 * @see https://trpc.io/docs/client/react/useUtils
			 */
			[ProcedureNames.context](): CreateUtils<Client, RouterError>,
			/**
			 * @see https://trpc.io/docs/client/react/useUtils
			 */
			[ProcedureNames.utils](): CreateUtils<Client, RouterError>,
			[ProcedureNames.queries]: CreateQueries<Client, RouterError>
			[ProcedureNames.serverQueries]: CreateServerQueries<Client, RouterError>
		} : {}
	), {
		get(_, key) {
			if (Object.hasOwn(procedures, key)) {
				const target = [...this.path].reduce((client, value) => client[value], client as Record<PropertyKey, any>);
				return procedures[key]({
					path: this.path,
					target,
					queryClient: qc,
					queriesProxy: () => createQueriesProxy(client),
					utilsProxy: () => createUtilsProxy(client, qc),
					abortOnUnmount,
				});
			}
			return this.nest(() => { });
		},
	});
}


