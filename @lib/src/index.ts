import DeepProxy from 'proxy-deep';

import {
	type TRPCClientErrorLike,
	type CreateTRPCProxyClient,
	TRPCUntypedClient,
} from '@trpc/client';
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
	QueriesResults,
} from '@tanstack/svelte-query';

import { onDestroy } from 'svelte';

// CREDIT: https://stackoverflow.com/a/63448246
type WithNevers<T, V> = {
	[K in keyof T]: Exclude<T[K], undefined> extends V
		? never
		: T[K] extends Record<string, unknown>
			? Without<T[K], V>
			: T[K];
};
type Without<T, V, I = WithNevers<T, V>> = Pick<
	I,
	{ [K in keyof I]: I[K] extends never ? never : K }[keyof I]
>;

type HasQuery = { query: (...args: any[]) => any };
type HasMutate = { mutate: (...args: any[]) => any };
type HasSubscribe = { subscribe: (...args: any[]) => any };
type OnlyQueries<TClient> = Without<TClient, HasMutate | HasSubscribe>;

// createUtils
const UtilsProcedure = {
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

type UtilsProcedures<
	TInput = undefined,
	TOutput = undefined,
	TError = undefined,
> = {
	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchquery
	 */
	[UtilsProcedure.fetch](
		input: TInput,
		opts?: FetchQueryOptions<TInput, TError, TOutput>
	): Promise<TOutput>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchinfinitequery
	 */
	[UtilsProcedure.fetchInfinite](
		input: TInput,
		opts?: FetchInfiniteQueryOptions<TInput, TError, TOutput>
	): Promise<InfiniteData<TOutput>>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientprefetchquery
	 */
	[UtilsProcedure.prefetch](
		input: TInput,
		opts?: FetchQueryOptions<TInput, TError, TOutput>
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientprefetchinfinitequery
	 */
	[UtilsProcedure.prefetchInfinite](
		input: TInput,
		opts?: FetchInfiniteQueryOptions<TInput, TError, TOutput>
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientensurequerydata
	 */
	[UtilsProcedure.ensureData](
		input?: TInput,
		opts?: FetchQueryOptions<TInput, TError, TOutput>
	): Promise<TOutput>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientinvalidatequeries
	 */
	[UtilsProcedure.invalidate](
		input?: TInput,
		filters?: InvalidateQueryFilters,
		options?: InvalidateOptions
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientrefetchqueries
	 */
	[UtilsProcedure.refetch](
		input?: TInput,
		filters?: RefetchQueryFilters,
		options?: RefetchOptions
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientcancelqueries
	 */
	[UtilsProcedure.cancel](
		input?: TInput,
		filters?: QueryFilters,
		options?: CancelOptions
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientresetqueries
	 */
	[UtilsProcedure.reset](
		input?: TInput,
		filters?: QueryFilters,
		options?: ResetOptions
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientsetquerydata
	 */
	[UtilsProcedure.setData](
		input: TInput,
		updater: Updater<TOutput | undefined, TOutput | undefined>,
		options?: SetDataOptions
	): void;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientsetquerydata
	 */
	[UtilsProcedure.setInfiniteData](
		input: TInput,
		updater: Updater<
			InfiniteData<TOutput> | undefined,
			InfiniteData<TOutput> | undefined
		>,
		options?: SetDataOptions
	): void;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientgetquerydata
	 */
	[UtilsProcedure.getData](input?: TInput): TOutput | undefined;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientgetquerydata
	 */
	[UtilsProcedure.getInfiniteData](
		input?: TInput
	): InfiniteData<TOutput> | undefined;
};

type AddUtilsPropTypes<TClient, TError> = {
	[K in keyof TClient]: TClient[K] extends HasQuery
		? UtilsProcedures<
				Parameters<TClient[K]['query']>[0],
				Awaited<ReturnType<TClient[K]['query']>>,
				TError
			>
		: AddUtilsPropTypes<TClient[K], TError> &
				Pick<UtilsProcedures, typeof UtilsProcedure.invalidate>;
};

type CreateUtils<TClient, TError> = AddUtilsPropTypes<
	OnlyQueries<TClient>,
	TError
> &
	Pick<UtilsProcedures, typeof UtilsProcedure.invalidate> & {
		[UtilsProcedure.client]: TClient;
	};

// createQueries
type CreateQueriesResult<TOpts extends any[], TCombinedResult> = ReturnType<
	typeof createQueries<TOpts, TCombinedResult>
>;
type CreateQueriesOpts<TOpts extends any[], TCombinedResult> = Omit<
	Parameters<typeof createQueries<TOpts, TCombinedResult>>[0],
	'queries'
>;

type CreateQueryOptionsForCreateQueries<TOutput, TError, TData> = Omit<
	CreateQueryOptions<TOutput, TError, TData>,
	'context' | 'queryKey' | 'queryFn'
>;

type CreateQueriesRecord<TClient, TError> = {
	[K in keyof TClient]: TClient[K] extends HasQuery
		? <TOutput = Awaited<ReturnType<TClient[K]['query']>>, TData = TOutput>(
				input: Parameters<TClient[K]['query']>[0],
				opts?: CreateQueryOptionsForCreateQueries<TOutput, TError, TData>
			) => CreateQueryOptionsForCreateQueries<TOutput, TError, TData>
		: CreateQueriesRecord<TClient[K], TError>;
};

type CreateQueries<TClient, TError> = <
	TOpts extends CreateQueryOptionsForCreateQueries<any, any, any>[],
	TCombinedResult = QueriesResults<TOpts>,
>(
	queriesCallback: (
		t: CreateQueriesRecord<OnlyQueries<TClient>, TError>
	) => readonly [...TOpts],
	opts?: CreateQueriesOpts<TOpts, TCombinedResult>
) => CreateQueriesResult<TOpts, TCombinedResult>;

// createServerQueries
type CreateQueryOptionsForCreateServerQueries<TOutput, TError, TData> =
	CreateQueryOptionsForCreateQueries<TOutput, TError, TData> & {
		ssr?: boolean;
	};

type CreateServerQueriesRecord<TClient, TError> = {
	[K in keyof TClient]: TClient[K] extends HasQuery
		? <TOutput = Awaited<ReturnType<TClient[K]['query']>>, TData = TOutput>(
				input: Parameters<TClient[K]['query']>[0],
				opts?: CreateQueryOptionsForCreateServerQueries<TOutput, TError, TData>
			) => CreateQueryOptionsForCreateServerQueries<TOutput, TError, TData>
		: CreateQueriesRecord<TClient[K], TError>;
};

type CreateServerQueries<TClient, TError> = <
	TOpts extends CreateQueryOptionsForCreateQueries<any, any, any>[],
	TCombinedResult = QueriesResults<TOpts>,
>(
	queriesCallback: (
		t: CreateServerQueriesRecord<OnlyQueries<TClient>, TError>
	) => readonly [...TOpts],
	opts?: CreateQueriesOpts<TOpts, TCombinedResult>
) => Promise<
	(
		queriesCallback?: (
			t: CreateQueriesRecord<OnlyQueries<TClient>, TError>,
			old: readonly [...TOpts]
		) => readonly [...TOpts]
	) => CreateQueriesResult<TOpts, TCombinedResult>
>;

// Procedures
const Procedure = {
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

type CreateTRPCQueryOptions<TOutput, TError, TData> = Omit<
	CreateQueryOptions<TOutput, TError, TData>,
	'queryKey' | 'queryFn'
>;
type CreateTRPCServerQueryOptions<TOutput, TError, TData> =
	CreateTRPCQueryOptions<TOutput, TError, TData> & {
		ssr?: boolean;
	};

type TRPCQueryOpts = {
	trpc?: {
		abortOnUnmount?: boolean;
	};
};

type CreateQueryProcedure<TInput, TOutput, TError> = {
	[Procedure.query]: <TData = TOutput>(
		input: TInput,
		opts?: CreateTRPCQueryOptions<TOutput, TError, TData> & TRPCQueryOpts
	) => CreateQueryResult<TData, TError>;
} & {
	[Procedure.serverQuery]: <TData = TOutput>(
		input: TInput,
		opts?: CreateTRPCServerQueryOptions<TOutput, TError, TData> & TRPCQueryOpts
	) => Promise<
		(
			...args: [TInput | ((old: TInput) => TInput)] | []
		) => CreateQueryResult<TData, TError>
	>;
} & {};

type CreateTRPCInfiniteQueryOptions<TInput, TOutput, TError, TData> = Omit<
	CreateInfiniteQueryOptions<
		TOutput,
		TError,
		TData,
		TData,
		any,
		ExtractCursorType<TInput>
	>,
	'queryKey' | 'queryFn' | 'initialPageParam'
>;
type CreateTRPCServerInfiniteQueryOptions<TInput, TOutput, TError, TData> =
	CreateTRPCInfiniteQueryOptions<TInput, TOutput, TError, TData> & {
		ssr?: boolean;
	};

export type ExtractCursorType<TInput> = TInput extends { cursor?: any }
	? TInput['cursor']
	: unknown;

type InfiniteQueryOpts<TInput> = {
	initialCursor?: ExtractCursorType<TInput>;
};

type CreateInfiniteQueryProcedure<TInput, TOutput, TError> = (TInput extends {
	cursor?: any;
}
	? {
			[Procedure.infiniteQuery]: <TData = TOutput>(
				input: Omit<TInput, 'cursor'>,
				opts: CreateTRPCInfiniteQueryOptions<TInput, TOutput, TError, TData> &
					InfiniteQueryOpts<TInput> &
					TRPCQueryOpts
			) => CreateInfiniteQueryResult<
				InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
				TError
			>;
			[Procedure.serverInfiniteQuery]: <TData = TOutput>(
				input: Omit<TInput, 'cursor'>,
				opts: CreateTRPCServerInfiniteQueryOptions<
					TInput,
					TOutput,
					TError,
					TData
				> &
					InfiniteQueryOpts<TInput> &
					TRPCQueryOpts
			) => Promise<
				(
					...args: [TInput | ((old: TInput) => TInput)] | []
				) => CreateInfiniteQueryResult<
					InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
					TError
				>
			>;
		}
	: {}) & {};

type QueryProcedures<TInput, TOutput, TError> = GetQueryKey<TInput> &
	CreateQueryProcedure<TInput, TOutput, TError> &
	CreateInfiniteQueryProcedure<TInput, TOutput, TError>;

type CreateMutationProcedure<TInput, TOutput, TError, TContext = unknown> = {
	[Procedure.mutate]: (
		opts?: CreateMutationOptions<TOutput, TError, TInput, TContext>
	) => CreateMutationResult<TOutput, TError, TInput, TContext>;
} & {};

type CreateSubscriptionOptions<TOutput, TError> = {
	enabled?: boolean;
	onStarted?: () => void;
	onData: (data: TOutput) => void;
	onError?: (err: TError) => void;
};

type GetSubscriptionOutput<TOpts> = TOpts extends unknown & Partial<infer A>
	? A extends { onData: any }
		? Parameters<A['onData']>[0]
		: never
	: never;

type CreateSubscriptionProcedure<TInput, TOutput, TError> = {
	[Procedure.subscribe]: (
		input: TInput,
		opts?: CreateSubscriptionOptions<TOutput, TError>
	) => void;
} & {};

type AddQueryPropTypes<TClient, TError> =
	TClient extends Record<any, any>
		? {
				[K in keyof TClient]: TClient[K] extends HasQuery
					? QueryProcedures<
							Parameters<TClient[K]['query']>[0],
							Awaited<ReturnType<TClient[K]['query']>>,
							TError
						> & {}
					: TClient[K] extends HasMutate
						? CreateMutationProcedure<
								Parameters<TClient[K]['mutate']>[0],
								Awaited<ReturnType<TClient[K]['mutate']>>,
								TError
							>
						: TClient[K] extends HasSubscribe
							? CreateSubscriptionProcedure<
									Parameters<TClient[K]['subscribe']>[0],
									GetSubscriptionOutput<Parameters<TClient[K]['subscribe']>[1]>,
									TError
								>
							: GetQueryKey & AddQueryPropTypes<TClient[K], TError>;
			}
		: TClient;

// Implementation
function createQueriesProxy({
	client,
	abortOnUnmount,
}: {
	client: TRPCUntypedClient<AnyRouter>;
	abortOnUnmount?: boolean;
}) {
	return new DeepProxy(
		{},
		{
			get() {
				return this.nest(() => {});
			},
			apply(_target, _thisArg, argList) {
				const [input, opts] = argList;
				const shouldAbortOnUnmount =
					opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

				return {
					...opts,
					queryKey: getArrayQueryKey(this.path, input, 'query'),
					queryFn: ({ signal }) =>
						client.query(this.path.join('.'), input, {
							...(shouldAbortOnUnmount && { signal }),
						}),
				} satisfies CreateQueryOptions;
			},
		}
	);
}

const utilsProcedures: Record<
	PropertyKey,
	(ctx: {
		path: string[];
		queryClient: QueryClient;
		client: TRPCUntypedClient<AnyRouter>;
	}) => any
> = {
	[UtilsProcedure.fetch]: ({ path, queryClient, client }) => {
		return (input: any, opts?: any) => {
			return queryClient.fetchQuery({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'query'),
				queryFn: () => client.query(path.join('.'), input),
			});
		};
	},
	[UtilsProcedure.prefetch]: ({ path, queryClient, client }) => {
		return (input: any, opts?: any) => {
			return queryClient.prefetchQuery({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'query'),
				queryFn: () => client.query(path.join('.'), input),
			});
		};
	},
	[UtilsProcedure.fetchInfinite]: ({ path, queryClient, client }) => {
		return (input: any, opts?: any) => {
			return queryClient.fetchInfiniteQuery({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'infinite'),
				queryFn: ({ pageParam }: { pageParam: number }) =>
					client.query(path.join('.'), { ...input, cursor: pageParam }),
			});
		};
	},
	[UtilsProcedure.prefetchInfinite]: ({ path, queryClient, client }) => {
		return (input: any, opts?: any) => {
			return queryClient.prefetchInfiniteQuery({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'infinite'),
				queryFn: ({ pageParam }: { pageParam: number }) =>
					client.query(path.join('.'), { ...input, cursor: pageParam }),
			});
		};
	},
	[UtilsProcedure.ensureData]: ({ path, queryClient, client }) => {
		return (input: any, opts?: any) => {
			return queryClient.ensureQueryData({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'query'),
				queryFn: () => client.query(path.join('.'), input),
			});
		};
	},
	[UtilsProcedure.invalidate]: ({ path, queryClient }) => {
		return (input?: any, filters?: any, options?: any) => {
			return queryClient.invalidateQueries(
				{
					...filters,
					queryKey: getArrayQueryKey(path, input, 'any'),
				},
				options
			);
		};
	},
	[UtilsProcedure.refetch]: ({ path, queryClient }) => {
		return (input?: any, filters?: any, options?: any) => {
			return queryClient.refetchQueries(
				{
					...filters,
					queryKey: getArrayQueryKey(path, input, 'any'),
				},
				options
			);
		};
	},
	[UtilsProcedure.cancel]: ({ path, queryClient }) => {
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
	[UtilsProcedure.reset]: ({ queryClient, path }) => {
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
	[UtilsProcedure.setData]: ({ queryClient, path }) => {
		return (input: any, updater: any, options?: any) => {
			return queryClient.setQueryData(
				getArrayQueryKey(path, input, 'query'),
				updater,
				options
			);
		};
	},
	[UtilsProcedure.setInfiniteData]: ({ queryClient, path }) => {
		return (input: any, updater: any, options?: any) => {
			return queryClient.setQueryData(
				getArrayQueryKey(path, input, 'infinite'),
				updater,
				options
			);
		};
	},
	[UtilsProcedure.getData]: ({ queryClient, path }) => {
		return (input?: any) => {
			return queryClient.getQueryData(getArrayQueryKey(path, input, 'query'));
		};
	},
	[UtilsProcedure.getInfiniteData]: ({ queryClient, path }) => {
		return (input?: any) => {
			return queryClient.getQueryData(
				getArrayQueryKey(path, input, 'infinite')
			);
		};
	},
};

function createUtilsProxy({
	client,
	queryClient,
}: {
	client: TRPCUntypedClient<AnyRouter>;
	queryClient: QueryClient;
}) {
	return new DeepProxy(
		{},
		{
			get(_target, key, _receiver) {
				if (key === UtilsProcedure.client) return client;

				if (Object.hasOwn(utilsProcedures, key)) {
					return utilsProcedures[key]({
						path: this.path,
						client,
						queryClient,
					});
				}

				return this.nest(() => {});
			},
		}
	);
}

const procedures: Record<
	PropertyKey,
	(ctx: {
		client: TRPCUntypedClient<AnyRouter>;
		path: string[];
		queryClient: QueryClient;
		queriesProxy: () => any;
		utilsProxy: () => any;
		abortOnUnmount?: boolean;
	}) => any
> = {
	[Procedure.queryKey]: ({ path }) => {
		return (input: any, opts?: any) => getArrayQueryKey(path, input, opts);
	},
	[Procedure.query]: ({ path, client, abortOnUnmount }) => {
		return (input: any, opts?: any) => {
			const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;
			return createQuery({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'query'),
				queryFn: ({ signal }) =>
					client.query(path.join('.'), input, {
						...(shouldAbortOnUnmount && { signal }),
					}),
			});
		};
	},
	[Procedure.serverQuery]: ({ path, client, queryClient, abortOnUnmount }) => {
		const pathString = path.join('.');

		return async (input: any, opts?: any) => {
			const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;
			const query: FetchQueryOptions = {
				queryKey: getArrayQueryKey(path, input, 'query'),
				queryFn: ({ signal }) =>
					client.query(pathString, input, {
						...(shouldAbortOnUnmount && { signal }),
					}),
			};

			const cache = queryClient
				.getQueryCache()
				.find({ queryKey: query.queryKey });
			const cacheNotFound = !cache?.state?.data;
			if (opts?.ssr !== false && cacheNotFound) {
				await queryClient.prefetchQuery(query);
			}

			const defaultOptions = queryClient.getDefaultOptions();

			return (...args: any[]) => {
				let newQuery = query;

				if (args.length > 0) {
					const newInput = args[0];
					let i = newInput;
					if (typeof newInput === 'function') i = newInput(input);
					newQuery = {
						queryKey: getArrayQueryKey(path, i, 'query'),
						queryFn: ({ signal }) =>
							client.query(pathString, i, {
								...(shouldAbortOnUnmount && { signal }),
							}),
					};
				}

				return createQuery({
					...opts,
					...newQuery,
					...(cacheNotFound
						? {
								refetchOnMount:
									opts?.refetchOnMount ??
									defaultOptions.queries?.refetchOnMount ??
									false,
							}
						: {}),
				});
			};
		};
	},
	[Procedure.infiniteQuery]: ({ path, client, abortOnUnmount }) => {
		return (input: any, opts?: any) => {
			const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;
			return createInfiniteQuery({
				...opts,
				initialPageParam: opts.initialCursor ?? null,
				queryKey: getArrayQueryKey(path, input, 'infinite'),
				queryFn: ({ pageParam, signal }) =>
					client.query(
						path.join('.'),
						{ ...input, cursor: pageParam ?? opts?.initialCursor },
						{ ...(shouldAbortOnUnmount && { signal }) }
					),
			});
		};
	},
	[Procedure.serverInfiniteQuery]: ({
		path,
		client,
		queryClient,
		abortOnUnmount,
	}) => {
		const pathString = path.join('.');

		return async (input: any, opts?: any) => {
			const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;
			const query: Omit<FetchInfiniteQueryOptions, 'initialPageParam'> = {
				queryKey: getArrayQueryKey(path, input, 'infinite'),
				queryFn: ({ pageParam, signal }) =>
					client.query(
						pathString,
						{ ...input, cursor: pageParam ?? opts?.initialCursor },
						{ ...(shouldAbortOnUnmount && { signal }) }
					),
			};

			const cache = queryClient
				.getQueryCache()
				.find({ queryKey: query.queryKey });
			const cacheNotFound = !cache?.state?.data;
			if (opts?.ssr !== false && cacheNotFound) {
				await queryClient.prefetchInfiniteQuery(query as any);
			}

			return (...args: any[]) => {
				let newQuery = query;

				if (args.length > 0) {
					const newInput = args[0];
					let i = newInput;
					if (typeof newInput === 'function') i = newInput(input);
					newQuery = {
						queryKey: getArrayQueryKey(path, i, 'infinite'),
						queryFn: ({ pageParam, signal }) =>
							client.query(
								pathString,
								{ ...i, cursor: pageParam ?? opts?.initialCursor },
								{ ...(shouldAbortOnUnmount && { signal }) }
							),
					};
				}

				const defaultOptions = queryClient.getDefaultOptions();

				return createInfiniteQuery({
					...opts,
					initialPageParam: opts.initialCursor ?? null,
					...newQuery,
					...(cacheNotFound
						? {
								refetchOnMount:
									opts?.refetchOnMount ??
									defaultOptions.queries?.refetchOnMount ??
									false,
							}
						: {}),
				});
			};
		};
	},
	[Procedure.mutate]: ({ path, client }) => {
		return (opts?: any) => {
			return createMutation({
				...opts,
				mutationKey: path,
				mutationFn: (data) => client.mutation(path.join('.'), data),
			});
		};
	},
	[Procedure.subscribe]: ({ path, client }) => {
		return (input: any, opts?: any) => {
			const enabled = opts?.enabled ?? true;
			if (!enabled) return;

			let isStopped = false;
			const subscription = client.subscription(path.join('.'), input, {
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
	[Procedure.queries]: ({ path, queriesProxy }) => {
		if (path.length !== 0) return;
		return (input: (...args: any[]) => any, opts?: any) => {
			return createQueries({
				...opts,
				queries: input(queriesProxy()),
			});
		};
	},
	[Procedure.serverQueries]: ({ path, queriesProxy, queryClient }) => {
		if (path.length !== 0) return;
		const proxy = queriesProxy();

		const defaultOptions = queryClient.getDefaultOptions();

		return async (input: (...args: any[]) => any, opts?: any) => {
			const queries = await Promise.all(
				input(proxy).map(async (query: any) => {
					const cache = queryClient
						.getQueryCache()
						.find({ queryKey: query.queryKey });
					const cacheNotFound = !cache?.state?.data;

					if (query.ssr !== false && cacheNotFound) {
						await queryClient.prefetchQuery(query);
					}

					return {
						...query,
						...(cacheNotFound
							? {
									refetchOnMount:
										query.refetchOnMount ??
										defaultOptions.queries?.refetchOnMount ??
										false,
								}
							: {}),
					};
				})
			);

			return (newInput?: (...args: any[]) => any) => {
				let newQueries = queries;
				if (newInput) newQueries = newInput(proxy, queries);
				return createQueries({
					...opts,
					queries: newQueries,
				});
			};
		};
	},
	[Procedure.utils]: ({ path, utilsProxy }) => {
		if (path.length !== 0) return;
		return utilsProxy;
	},
	[Procedure.context]: ({ path, utilsProxy }) => {
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
	const arrayPath = (
		typeof queryKey === 'string'
			? queryKey === ''
				? []
				: queryKey.split('.')
			: queryKey
	) as [string];

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
			[Procedure.queryKey]: () => QueryKey;
		}
	: {
			/**
			 * Method to extract the query key for a procedure
			 * @param type - defaults to `any`
			 */
			[Procedure.queryKey]: (input: TInput, type?: QueryType) => QueryKey;
		} & {};

export function svelteQueryWrapper<TRouter extends AnyRouter>({
	client,
	queryClient,
	abortOnUnmount,
}: {
	client: CreateTRPCProxyClient<TRouter>;
	queryClient?: QueryClient;
	abortOnUnmount?: boolean;
}) {
	type Client = typeof client;
	type RouterError = TRPCClientErrorLike<TRouter>;
	type ClientWithQuery = AddQueryPropTypes<Client, RouterError>;

	const qc = queryClient ?? useQueryClient();
	const innerClient = client.__untypedClient as TRPCUntypedClient<TRouter>;

	return new DeepProxy(
		{} as ClientWithQuery &
			(ClientWithQuery extends Record<any, any>
				? {
						/**
						 * @deprecated renamed to `createUtils` and will be removed in a future tRPC version
						 *
						 * @see https://trpc.io/docs/client/react/useUtils
						 */
						[Procedure.context](): CreateUtils<Client, RouterError>;
						/**
						 * @see https://trpc.io/docs/client/react/useUtils
						 */
						[Procedure.utils](): CreateUtils<Client, RouterError>;
						[Procedure.queries]: CreateQueries<Client, RouterError>;
						[Procedure.serverQueries]: CreateServerQueries<Client, RouterError>;
					}
				: {}),
		{
			get(_, key) {
				if (Object.hasOwn(procedures, key)) {
					// REFER: https://github.com/trpc/trpc/blob/c6e46bbd493f0ea32367eaa33c3cabe19a2614a0/packages/client/src/createTRPCClient.ts#L143
					return procedures[key]({
						client: innerClient,
						path: this.path,
						queryClient: qc,
						queriesProxy: () =>
							createQueriesProxy({ client: innerClient, abortOnUnmount }),
						utilsProxy: () =>
							createUtilsProxy({ client: innerClient, queryClient: qc }),
						abortOnUnmount,
					});
				}
				return this.nest(() => {});
			},
		}
	);
}
