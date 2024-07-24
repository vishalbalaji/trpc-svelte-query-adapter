import DeepProxy from 'proxy-deep';

import type {
	TRPCClientErrorLike,
	CreateTRPCProxyClient,
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
	type StoreOrVal as _StoreOrVal,
	type QueryObserverResult,
	type QueryObserverOptions,
	type DefaultError,
	type OmitKeyof,
	type QueriesPlaceholderDataFunction,
} from '@tanstack/svelte-query';

import { onDestroy, onMount } from 'svelte';
import {
	derived,
	get,
	writable,
	type Readable,
	type Writable,
} from 'svelte/store';

type InnerClient = TRPCUntypedClient<AnyRouter>;

type StoreOrVal<T> = _StoreOrVal<T> | Writable<T>;

export function isSvelteStore<T extends object>(
	obj: StoreOrVal<T>
): obj is Readable<T> {
	return (
		typeof obj === 'object' &&
		'subscribe' in obj &&
		typeof obj.subscribe === 'function'
	);
}

const blank = Symbol('blank');
export const isBlank = (val: unknown): val is typeof blank => val === blank;
export const blankStore: Readable<typeof blank> = {
	subscribe(run) {
		run(blank);
		return () => {};
	},
};

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

const Util = {
	Query: {
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
	},

	Mutation: {
		setMutationDefaults: 'setMutationDefaults',
		getMutationDefaults: 'getMutationDefaults',
		isMutating: 'isMutating',
	},
} as const;

// createUtils
type QueryUtils<TInput = undefined, TOutput = undefined, TError = undefined> = {
	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchquery
	 */
	[Util.Query.fetch](
		input: TInput,
		opts?: FetchQueryOptions<TInput, TError, TOutput>
	): Promise<TOutput>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchinfinitequery
	 */
	[Util.Query.fetchInfinite](
		input: TInput,
		opts?: FetchInfiniteQueryOptions<TInput, TError, TOutput>
	): Promise<InfiniteData<TOutput>>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientprefetchquery
	 */
	[Util.Query.prefetch](
		input: TInput,
		opts?: FetchQueryOptions<TInput, TError, TOutput>
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientprefetchinfinitequery
	 */
	[Util.Query.prefetchInfinite](
		input: TInput,
		opts?: FetchInfiniteQueryOptions<TInput, TError, TOutput>
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientensurequerydata
	 */
	[Util.Query.ensureData](
		input?: TInput,
		opts?: FetchQueryOptions<TInput, TError, TOutput>
	): Promise<TOutput>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientinvalidatequeries
	 */
	[Util.Query.invalidate](
		input?: TInput,
		filters?: InvalidateQueryFilters,
		options?: InvalidateOptions
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientrefetchqueries
	 */
	[Util.Query.refetch](
		input?: TInput,
		filters?: RefetchQueryFilters,
		options?: RefetchOptions
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientcancelqueries
	 */
	[Util.Query.cancel](
		input?: TInput,
		filters?: QueryFilters,
		options?: CancelOptions
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientresetqueries
	 */
	[Util.Query.reset](
		input?: TInput,
		filters?: QueryFilters,
		options?: ResetOptions
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientsetquerydata
	 */
	[Util.Query.setData](
		input: TInput,
		updater: Updater<TOutput | undefined, TOutput | undefined>,
		options?: SetDataOptions
	): void;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientsetquerydata
	 */
	[Util.Query.setInfiniteData](
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
	[Util.Query.getData](input?: TInput): TOutput | undefined;

	/**
	 * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientgetquerydata
	 */
	[Util.Query.getInfiniteData](
		input?: TInput
	): InfiniteData<TOutput> | undefined;
};

type MutationUtils<
	TInput = undefined,
	TOutput = undefined,
	TError = undefined,
> = {
	[Util.Mutation.setMutationDefaults](
		opts:
			| CreateMutationOptions<TInput, TOutput, TError>
			| ((args: {
					canonicalMutationFn: NonNullable<
						CreateMutationOptions<TInput, TOutput, TError>['mutationFn']
					>;
			  }) => CreateMutationOptions<TInput, TOutput, TError>)
	): void;

	[Util.Mutation.getMutationDefaults]():
		| CreateMutationOptions<TInput, TOutput, TError>
		| undefined;

	[Util.Mutation.isMutating](): number;
};

// prettier-ignore
type AddUtilsPropTypes<TClient, TError> = {
	[K in keyof TClient]:
		TClient[K] extends HasQuery ? QueryUtils<
				Parameters<TClient[K]['query']>[0],
				Awaited<ReturnType<TClient[K]['query']>>,
				TError
			>
	: TClient[K] extends HasMutate ? MutationUtils<
			Parameters<TClient[K]['mutate']>[0],
			Awaited<ReturnType<TClient[K]['mutate']>>,
			TError
	>
	: AddUtilsPropTypes<TClient[K], TError> &
			Pick<QueryUtils, typeof Util.Query.invalidate>;
};

type CreateUtilsProcedure<TClient, TError> = {
	/**
	 * @see https://trpc.io/docs/client/react/useUtils
	 */
	[Procedure.utils](): AddUtilsPropTypes<TClient, TError> &
		Pick<QueryUtils, typeof Util.Query.invalidate> & {
			[Util.Query.client]: TClient;
		};

	/**
	 * @deprecated renamed to `createUtils` and will be removed in a future tRPC version
	 *
	 * @see https://trpc.io/docs/client/react/useUtils
	 */
	[Procedure.context](): AddUtilsPropTypes<TClient, TError> &
		Pick<QueryUtils, typeof Util.Query.invalidate> & {
			[Util.Query.client]: TClient;
		};
} & {};

// createQueries
// REFER: https://github.com/trpc/trpc/blob/936db6dd2598337758e29c843ff66984ed54faaf/packages/react-query/src/internals/useQueries.ts#L33
type QueriesResults<
	TQueriesOptions extends CreateQueryOptionsForCreateQueries<
		any,
		any,
		any,
		any
	>[],
> = {
	[TKey in keyof TQueriesOptions]: TQueriesOptions[TKey] extends CreateQueryOptionsForCreateQueries<
		infer TQueryFnData,
		infer TError,
		infer TData,
		any
	>
		? QueryObserverResult<unknown extends TData ? TQueryFnData : TData, TError>
		: never;
};

type QueryObserverOptionsForCreateQueries<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
> = OmitKeyof<
	QueryObserverOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>,
	'placeholderData'
> & {
	placeholderData?: TQueryFnData | QueriesPlaceholderDataFunction<TQueryFnData>;
};

type CreateQueryOptionsForCreateQueries<
	TOutput = unknown,
	TError = unknown,
	TData = unknown,
	TQueryKey extends QueryKey = QueryKey,
> = Omit<
	QueryObserverOptionsForCreateQueries<TOutput, TError, TData, TQueryKey>,
	'context' | 'queryKey' | 'queryFn'
> &
	TRPCQueryOpts;

type CreateQueriesRecord<TClient, TError> = {
	[K in keyof TClient]: TClient[K] extends HasQuery
		? <TOutput = Awaited<ReturnType<TClient[K]['query']>>, TData = TOutput>(
				input: Parameters<TClient[K]['query']>[0],
				opts?: CreateQueryOptionsForCreateQueries<TOutput, TError, TData>
			) => CreateQueryOptionsForCreateQueries<TOutput, TError, TData>
		: CreateQueriesRecord<TClient[K], TError>;
};

type CreateQueriesOpts<
	TOpts extends CreateQueryOptionsForCreateQueries[],
	TCombinedResult,
> = {
	combine?: (result: QueriesResults<TOpts>) => TCombinedResult;
};

// createServerQueries
type CreateQueryOptionsForCreateServerQueries<
	TOutput = unknown,
	TError = unknown,
	TData = unknown,
	TQueryKey extends QueryKey = QueryKey,
> = CreateQueryOptionsForCreateQueries<TOutput, TError, TData, TQueryKey> & {
	ssr?: boolean;
};

type CreateServerQueriesRecord<TClient, TError> = {
	[K in keyof TClient]: TClient[K] extends HasQuery
		? <TOutput = Awaited<ReturnType<TClient[K]['query']>>, TData = TOutput>(
				input: Parameters<TClient[K]['query']>[0],
				opts?: CreateQueryOptionsForCreateServerQueries<TOutput, TError, TData>
			) => CreateQueryOptionsForCreateServerQueries<TOutput, TError, TData>
		: CreateServerQueriesRecord<TClient[K], TError>;
};

type CreateQueriesProcedure<TClient = any, TError = any> = {
	[Procedure.queries]: <
		TOpts extends CreateQueryOptionsForCreateQueries<any, any, any, any>[],
		TCombinedResult = QueriesResults<TOpts>,
	>(
		queriesCallback: (
			t: CreateQueriesRecord<OnlyQueries<TClient>, TError>
		) => StoreOrVal<readonly [...TOpts]>,
		opts?: CreateQueriesOpts<TOpts, TCombinedResult>
	) => Readable<TCombinedResult>;

	[Procedure.serverQueries]: <
		TOpts extends CreateQueryOptionsForCreateServerQueries<
			any,
			any,
			any,
			any
		>[],
		TCombinedResult = QueriesResults<TOpts>,
	>(
		queriesCallback: (
			t: CreateServerQueriesRecord<OnlyQueries<TClient>, TError>
		) => readonly [...TOpts],
		opts?: CreateQueriesOpts<TOpts, TCombinedResult>
	) => Promise<
		(
			queriesCallback?: (
				t: CreateServerQueriesRecord<OnlyQueries<TClient>, TError>,
				old: readonly [...TOpts]
			) => StoreOrVal<readonly [...TOpts]>,
			opts?: CreateQueriesOpts<TOpts, TCombinedResult>
		) => Readable<TCombinedResult>
	>;
} & {};

// Procedures
type CreateTRPCQueryOptions<TOutput, TError, TData = TOutput> = Omit<
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

type CreateQueryProcedure<TInput = any, TOutput = any, TError = any> = {
	[Procedure.query]: <TData = TOutput>(
		input: StoreOrVal<TInput>,
		opts?: StoreOrVal<
			CreateTRPCQueryOptions<TOutput, TError, TData> & TRPCQueryOpts
		>
	) => CreateQueryResult<TData, TError>;

	[Procedure.serverQuery]: <TData = TOutput>(
		input: TInput,
		opts?: CreateTRPCServerQueryOptions<TOutput, TError, TData> & TRPCQueryOpts
	) => Promise<
		<TData = TOutput>(
			input?: StoreOrVal<TInput> | ((old: TInput) => StoreOrVal<TInput>),
			opts?: StoreOrVal<
				CreateTRPCServerQueryOptions<TOutput, TError, TData> & TRPCQueryOpts
			>
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

type CreateInfiniteQueryProcedure<TInput = any, TOutput = any, TError = any> = {
	[Procedure.infiniteQuery]: <TData = TOutput>(
		input: StoreOrVal<Omit<TInput, 'cursor'>>,
		opts: StoreOrVal<
			CreateTRPCInfiniteQueryOptions<TInput, TOutput, TError, TData> &
				InfiniteQueryOpts<TInput> &
				TRPCQueryOpts
		>
	) => CreateInfiniteQueryResult<
		InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
		TError
	>;

	[Procedure.serverInfiniteQuery]: <TData = TOutput>(
		input: Omit<TInput, 'cursor'>,
		opts: CreateTRPCServerInfiniteQueryOptions<TInput, TOutput, TError, TData> &
			InfiniteQueryOpts<TInput> &
			TRPCQueryOpts
	) => Promise<
		<TData = TOutput>(
			input?:
				| StoreOrVal<Omit<TInput, 'cursor'>>
				| ((old: Omit<TInput, 'cursor'>) => StoreOrVal<Omit<TInput, 'cursor'>>),
			opts?: StoreOrVal<
				CreateTRPCServerInfiniteQueryOptions<TInput, TOutput, TError, TData> &
					InfiniteQueryOpts<TInput> &
					TRPCQueryOpts
			>
			// ...args: [TInput | ((old: TInput) => TInput)] | []
		) => CreateInfiniteQueryResult<
			InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
			TError
		>
	>;
};

type QueryProcedures<TInput, TOutput, TError> = GetQueryKey<TInput> &
	CreateQueryProcedure<TInput, TOutput, TError> &
	(TInput extends { cursor?: any }
		? CreateInfiniteQueryProcedure<TInput, TOutput, TError>
		: {});

type CreateMutationProcedure<
	TInput = any,
	TOutput = any,
	TError = any,
	TContext = unknown,
> = {
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

type CreateSubscriptionProcedure<TInput = any, TOutput = any, TError = any> = {
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
type AdapterContext = {
	client: InnerClient;
	queryClient: QueryClient;
	path: string[];
	abortOnUnmount?: boolean;
};

function createQueriesProxy({ client, abortOnUnmount }: AdapterContext) {
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
		client: InnerClient;
	}) => any
> = {
	[Util.Query.fetch]: ({ path, queryClient, client }) => {
		return (input: any, opts?: any) => {
			return queryClient.fetchQuery({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'query'),
				queryFn: () => client.query(path.join('.'), input),
			});
		};
	},
	[Util.Query.prefetch]: ({ path, queryClient, client }) => {
		return (input: any, opts?: any) => {
			return queryClient.prefetchQuery({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'query'),
				queryFn: () => client.query(path.join('.'), input),
			});
		};
	},
	[Util.Query.fetchInfinite]: ({ path, queryClient, client }) => {
		return (input: any, opts?: any) => {
			return queryClient.fetchInfiniteQuery({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'infinite'),
				queryFn: ({ pageParam }: { pageParam: number }) =>
					client.query(path.join('.'), { ...input, cursor: pageParam }),
			});
		};
	},
	[Util.Query.prefetchInfinite]: ({ path, queryClient, client }) => {
		return (input: any, opts?: any) => {
			return queryClient.prefetchInfiniteQuery({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'infinite'),
				queryFn: ({ pageParam }: { pageParam: number }) =>
					client.query(path.join('.'), { ...input, cursor: pageParam }),
			});
		};
	},
	[Util.Query.ensureData]: ({ path, queryClient, client }) => {
		return (input: any, opts?: any) => {
			return queryClient.ensureQueryData({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'query'),
				queryFn: () => client.query(path.join('.'), input),
			});
		};
	},
	[Util.Query.invalidate]: ({ path, queryClient }) => {
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
	[Util.Query.refetch]: ({ path, queryClient }) => {
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
	[Util.Query.cancel]: ({ path, queryClient }) => {
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
	[Util.Query.reset]: ({ queryClient, path }) => {
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
	[Util.Query.setData]: ({ queryClient, path }) => {
		return (input: any, updater: any, options?: any) => {
			return queryClient.setQueryData(
				getArrayQueryKey(path, input, 'query'),
				updater,
				options
			);
		};
	},
	[Util.Query.setInfiniteData]: ({ queryClient, path }) => {
		return (input: any, updater: any, options?: any) => {
			return queryClient.setQueryData(
				getArrayQueryKey(path, input, 'infinite'),
				updater,
				options
			);
		};
	},
	[Util.Query.getData]: ({ queryClient, path }) => {
		return (input?: any) => {
			return queryClient.getQueryData(getArrayQueryKey(path, input, 'query'));
		};
	},
	[Util.Query.getInfiniteData]: ({ queryClient, path }) => {
		return (input?: any) => {
			return queryClient.getQueryData(
				getArrayQueryKey(path, input, 'infinite')
			);
		};
	},

	[Util.Mutation.setMutationDefaults]: ({ queryClient, path, client }) => {
		return (opts: any) => {
			return queryClient.setMutationDefaults(
				[path],
				typeof opts === 'function'
					? opts({
							canonicalMutationFn: (input: unknown) => {
								return client.mutation(path.join('.'), input, opts);
							},
						})
					: opts
			);
		};
	},
	[Util.Mutation.getMutationDefaults]: ({ queryClient, path }) => {
		return () => {
			return queryClient.getMutationDefaults([path]);
		};
	},
	[Util.Mutation.isMutating]: ({ queryClient, path }) => {
		return () => {
			queryClient.isMutating({
				mutationKey: [path],
				exact: true,
			});
		};
	},
};

function createUtilsProxy({ client, queryClient }: AdapterContext) {
	return new DeepProxy(
		{},
		{
			get(_target, key, _receiver) {
				if (key === Util.Query.client) return client;

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

const procedures: Record<PropertyKey, (ctx: AdapterContext) => any> = {
	[Procedure.queryKey]: ({ path }) => {
		return (input: any, opts?: any) => getArrayQueryKey(path, input, opts);
	},
	[Procedure.query]: ({ path, client, abortOnUnmount }) => {
		return (input: any, opts?: any) => {
			const isOptsStore = isSvelteStore(opts);
			const isInputStore = isSvelteStore(input);
			const currentOpts = isOptsStore ? get(opts) : opts;

			if (!isInputStore && !isOptsStore) {
				const shouldAbortOnUnmount =
					opts?.trpc?.abortOnUnmount ?? abortOnUnmount;
				return createQuery({
					...opts,
					queryKey: getArrayQueryKey(path, input, 'query'),
					queryFn: ({ signal }) =>
						client.query(path.join('.'), input, {
							...(shouldAbortOnUnmount && { signal }),
						}),
				});
			}

			const shouldAbortOnUnmount =
				currentOpts?.trpc?.abortOnUnmount ?? abortOnUnmount;

			return createQuery(
				derived(
					[isInputStore ? input : blankStore, isOptsStore ? opts : blankStore],
					([$input, $opts]) => {
						const newInput = !isBlank($input) ? $input : input;
						const newOpts = !isBlank($opts) ? $opts : opts;
						return {
							...newOpts,
							queryKey: getArrayQueryKey(path, newInput, 'query'),
							queryFn: ({ signal }) =>
								client.query(path.join('.'), newInput, {
									...(shouldAbortOnUnmount && { signal }),
								}),
						} satisfies CreateQueryOptions;
					}
				)
			);
		};
	},
	[Procedure.serverQuery]: ({ path, client, queryClient, abortOnUnmount }) => {
		const pathString = path.join('.');

		return async (_input: any, _opts?: any) => {
			let input = _input;
			let opts = _opts;
			let shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

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

			return (...args: any[]) => {
				if (args.length > 0) input = args.shift();
				if (args.length > 0) opts = args.shift();

				const isOptsStore = isSvelteStore(opts);
				const currentOpts = isOptsStore ? get(opts) : opts;
				shouldAbortOnUnmount =
					currentOpts?.trpc?.abortOnUnmount ?? abortOnUnmount;

				const staleTime = writable<number | null>(Infinity);
				onMount(() => { staleTime.set(null); }); // prettier-ignore

				return createQuery(
					derived(
						[
							isSvelteStore(input) ? input : blankStore,
							isOptsStore ? opts : blankStore,
							staleTime,
						],
						([$input, $opts, $staleTime]) => {
							const newInput = !isBlank($input) ? $input : input;
							const newOpts = !isBlank($opts) ? $opts : opts;
							return {
								...newOpts,
								queryKey: getArrayQueryKey(path, newInput, 'query'),
								queryFn: ({ signal }) =>
									client.query(pathString, newInput, {
										...(shouldAbortOnUnmount && { signal }),
									}),
								...($staleTime && { staleTime: $staleTime }),
							} satisfies CreateQueryOptions;
						}
					)
				);
			};
		};
	},
	[Procedure.infiniteQuery]: ({ path, client, abortOnUnmount }) => {
		return (input: any, opts?: any) => {
			const isOptsStore = isSvelteStore(opts);
			const isInputStore = isSvelteStore(input);
			const currentOpts = isOptsStore ? get(opts) : opts;

			if (!isInputStore && !isOptsStore) {
				const shouldAbortOnUnmount =
					opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

				return createInfiniteQuery({
					...opts,
					initialPageParam: opts?.initialCursor ?? null,
					queryKey: getArrayQueryKey(path, input, 'infinite'),
					queryFn: ({ pageParam, signal }) =>
						client.query(
							path.join('.'),
							{ ...input, cursor: pageParam ?? opts?.initialCursor },
							{ ...(shouldAbortOnUnmount && { signal }) }
						),
				} satisfies CreateInfiniteQueryOptions);
			}

			const shouldAbortOnUnmount =
				currentOpts?.trpc?.abortOnUnmount ?? abortOnUnmount;

			return createInfiniteQuery(
				derived(
					[isInputStore ? input : blankStore, isOptsStore ? opts : blankStore],
					([$input, $opts]) => {
						const newInput = !isBlank($input) ? $input : input;
						const newOpts = !isBlank($opts) ? $opts : opts;

						return {
							...newOpts,
							queryKey: getArrayQueryKey(path, newInput, 'infinite'),
							queryFn: ({ pageParam, signal }) =>
								client.query(
									path.join('.'),
									{ ...newInput, cursor: pageParam ?? newOpts?.initialCursor },
									{ ...(shouldAbortOnUnmount && { signal }) }
								),
						} satisfies CreateInfiniteQueryOptions;
					}
				)
			);
		};
	},
	[Procedure.serverInfiniteQuery]: ({
		path,
		client,
		queryClient,
		abortOnUnmount,
	}) => {
		const pathString = path.join('.');

		return async (_input: any, _opts?: any) => {
			let input = _input;
			let opts = _opts;
			let shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

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
				if (args.length > 0) input = args.shift();
				if (args.length > 0) opts = args.shift();

				const isOptsStore = isSvelteStore(opts);
				const currentOpts = isOptsStore ? get(opts) : opts;
				shouldAbortOnUnmount =
					currentOpts?.trpc?.abortOnUnmount ?? abortOnUnmount;

				const staleTime = writable<number | null>(Infinity);
				onMount(() => { staleTime.set(null); }); // prettier-ignore

				return createInfiniteQuery(
					derived(
						[
							isSvelteStore(input) ? input : blankStore,
							isOptsStore ? opts : blankStore,
							staleTime,
						],
						([$input, $opts, $staleTime]) => {
							const newInput = !isBlank($input) ? $input : input;
							const newOpts = !isBlank($opts) ? $opts : opts;

							return {
								...newOpts,
								initialPageParam: newOpts?.initialCursor,
								queryKey: getArrayQueryKey(path, newInput, 'infinite'),
								queryFn: ({ pageParam, signal }) =>
									client.query(
										pathString,
										{
											...newInput,
											cursor: pageParam ?? newOpts?.initialCursor,
										},
										{ ...(shouldAbortOnUnmount && { signal }) }
									),
								...($staleTime && { staleTime: $staleTime }),
							} satisfies CreateInfiniteQueryOptions;
						}
					)
				);
			};
		};
	},
	[Procedure.mutate]: ({ path, client }) => {
		return (opts?: any) => {
			return createMutation({
				...opts,
				mutationKey: [path],
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
	[Procedure.queries]: (ctx) => {
		if (ctx.path.length !== 0) return;
		return (input: (...args: any[]) => any, opts?: any) => {
			return createQueries({
				...opts,
				queries: input(createQueriesProxy(ctx)),
			});
		};
	},
	[Procedure.serverQueries]: (ctx) => {
		const { path, queryClient } = ctx;
		if (path.length !== 0) return;
		const proxy = createQueriesProxy(ctx);

		return async (
			input: (...args: any[]) => QueryObserverOptionsForCreateQueries[],
			_opts?: any
		) => {
			let opts = _opts;

			let queries = input(proxy);
			await Promise.all(
				queries.map(async (query: any) => {
					const cache = queryClient
						.getQueryCache()
						.find({ queryKey: query.queryKey });
					const cacheNotFound = !cache?.state?.data;

					if (query.ssr !== false && cacheNotFound) {
						await queryClient.prefetchQuery(query);
					}
				})
			);

			return (...args: any[]) => {
				if (args.length > 0) queries = args.shift()!(proxy, queries);
				if (args.length > 0) opts = args.shift();

				const staleTime = writable<number | null>(Infinity);
				onMount(() => { staleTime.set(null); }); // prettier-ignore

				return createQueries({
					...opts,
					queries: derived(
						[isSvelteStore(queries) ? queries : blankStore, staleTime],
						([$queries, $staleTime]) => {
							const newQueries = !isBlank($queries) ? $queries : queries;
							if (!staleTime) return newQueries;
							return newQueries.map((query) => ({
								...query,
								...($staleTime && { staleTime: $staleTime }),
							}));
						}
					),
				});
			};
		};
	},
	[Procedure.utils]: (ctx) => {
		if (ctx.path.length !== 0) return;
		return () => createUtilsProxy(ctx);
	},
	[Procedure.context]: (ctx) => {
		if (ctx.path.length !== 0) return;
		return () => createUtilsProxy(ctx);
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

type ValFromStore<T> = T extends Readable<infer U> ? U : T;

// prettier-ignore
export type InferProcedureOpts<
	T extends
	| CreateQueryProcedure[typeof Procedure.query]
	| CreateInfiniteQueryProcedure[typeof Procedure.infiniteQuery]
	| CreateMutationProcedure[typeof Procedure.mutate]
	| CreateSubscriptionProcedure[typeof Procedure.subscribe],
> = NonNullable<(
		T extends CreateQueryProcedure[typeof Procedure.query] ? ValFromStore<Parameters<T>[1]>
	: T extends CreateInfiniteQueryProcedure[typeof Procedure.infiniteQuery] ? ValFromStore<Parameters<T>[1]>
	: T extends CreateMutationProcedure[typeof Procedure.mutate] ? ValFromStore<Parameters<T>[0]>
	: T extends CreateSubscriptionProcedure[typeof Procedure.subscribe] ? ValFromStore<Parameters<T>[1]>
	: never
)>;

export function svelteQueryWrapper<TRouter extends AnyRouter>({
	client,
	queryClient: _queryClient,
	abortOnUnmount,
}: {
	client: CreateTRPCProxyClient<TRouter>;
	queryClient?: QueryClient;
	abortOnUnmount?: boolean;
}) {
	type Client = typeof client;
	type RouterError = TRPCClientErrorLike<TRouter>;
	type ClientWithQuery = AddQueryPropTypes<Client, RouterError>;

	const queryClient = _queryClient ?? useQueryClient();

	// REFER: https://github.com/trpc/trpc/blob/c6e46bbd493f0ea32367eaa33c3cabe19a2614a0/packages/client/src/createTRPCClient.ts#L143
	const innerClient = client.__untypedClient as InnerClient;

	return new DeepProxy(
		// prettier-ignore
		{} as ClientWithQuery &
			(ClientWithQuery extends Record<any, any>
				? CreateUtilsProcedure<Client, RouterError>
					& CreateQueriesProcedure<Client, RouterError>
				: {}),
		{
			get(_, key) {
				if (Object.hasOwn(procedures, key)) {
					return procedures[key]({
						client: innerClient,
						path: this.path,
						queryClient,
						abortOnUnmount,
					});
				}
				return this.nest(() => {});
			},
		}
	);
}
