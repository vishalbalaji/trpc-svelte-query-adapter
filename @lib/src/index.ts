import DeepProxy from 'proxy-deep';

import type {
	TRPCClientErrorLike,
	CreateTRPCProxyClient,
	TRPCUntypedClient,
} from '@trpc/client';
import type { AnyRouter, DeepPartial } from '@trpc/server';

import {
	useQueryClient,
	createQuery,
	createMutation,
	createInfiniteQuery,
	createQueries,
	skipToken,
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
	type Query,
	type SetDataOptions,
	type QueryClient,
	type InvalidateOptions,
	type CreateQueryResult,
	type CreateInfiniteQueryResult,
	type CreateMutationResult,
	type StoreOrVal as _StoreOrVal,
	type QueryObserverResult,
	type QueryObserverOptions,
	type DefaultError,
	type OmitKeyof,
	type QueriesPlaceholderDataFunction,
	hashKey,
} from '@tanstack/svelte-query';

import { afterUpdate, onDestroy, onMount } from 'svelte';
import {
	derived,
	get,
	writable,
	type Readable,
	type Writable,
} from 'svelte/store';

type StoreOrVal<T> = _StoreOrVal<T> | Writable<T>;

/**
 * Omits the key without removing a potential union
 * @internal
 */
type DistributiveOmit<TObj, TKey extends keyof any> = TObj extends any
	? Omit<TObj, TKey>
	: never;

function isSvelteStore<T extends object>(
	obj: StoreOrVal<T>
): obj is Readable<T> {
	return (
		typeof obj === 'object' &&
		'subscribe' in obj &&
		typeof obj.subscribe === 'function'
	);
}

const blank = Symbol('blank');
const isBlank = (val: unknown): val is typeof blank => val === blank;
const blankStore: Readable<typeof blank> = {
	subscribe(run) {
		run(blank);
		return () => {};
	},
};

type ValueOf<T> = T[keyof T];

type ExhaustiveRecord<
	TKey extends PropertyKey,
	TValue = any,
	U extends
		| (
				{ [K in TKey]: TValue } &
				{ [K in keyof U]: K extends TKey ? TValue : never; }
			)
		| undefined
	= undefined,
> = U extends undefined ? { [K in TKey]: TValue }
	: U extends { [K in TKey]: TValue } ? U
	: never; // prettier-ignore

function hasOwn<T extends object>(obj: T, prop: PropertyKey): prop is keyof T {
	return typeof obj === 'object' && Object.hasOwn(obj as any, prop);
}

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

// getQueryKey
type GetInfiniteQueryInput<
	TProcedureInput,
	TInputWithoutCursorAndDirection = Omit<
		TProcedureInput,
		'cursor' | 'direction'
	>,
> = keyof TInputWithoutCursorAndDirection extends never
	? undefined
	: DeepPartial<TInputWithoutCursorAndDirection> | undefined;

type GetQueryProcedureInput<TProcedureInput> = TProcedureInput extends {
	cursor?: any;
}
	? GetInfiniteQueryInput<TProcedureInput>
	: DeepPartial<TProcedureInput> | undefined;

type QueryType = 'query' | 'infinite' | 'any';

export type TRPCQueryKey = [
	readonly string[],
	{ input?: unknown; type?: Exclude<QueryType, 'any'> }?,
];

export type TRPCMutationKey = [readonly string[]]; // = [TRPCQueryKey[0]]

type QueryKeyKnown<TInput, TType extends Exclude<QueryType, 'any'>> = [
	string[],
	{ input?: GetQueryProcedureInput<TInput>; type: TType }?,
];

/**
 * Check that value is object
 * @internal
 */
function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && !Array.isArray(value) && typeof value === 'object';
}

function getQueryKeyInternal(
	path: readonly string[],
	input: unknown,
	type: QueryType
): TRPCQueryKey {
	// Construct a query key that is easy to destructure and flexible for
	// partial selecting etc.
	// https://github.com/trpc/trpc/issues/3128

	// some parts of the path may be dot-separated, split them up
	const splitPath = path.flatMap((part) => part.split('.'));

	if (!input && (!type || type === 'any')) {
		// this matches also all mutations (see `getMutationKeyInternal`)

		// for `utils.invalidate()` to match all queries (including vanilla react-query)
		// we don't want nested array if path is empty, i.e. `[]` instead of `[[]]`
		return splitPath.length ? [splitPath] : ([] as unknown as TRPCQueryKey);
	}

	if (
		type === 'infinite' &&
		isObject(input) &&
		('direction' in input || 'cursor' in input)
	) {
		const {
			cursor: _,
			direction: __,
			...inputWithoutCursorAndDirection
		} = input;
		return [
			splitPath,
			{
				input: inputWithoutCursorAndDirection,
				type: 'infinite',
			},
		];
	}
	return [
		splitPath,
		{
			...(typeof input !== 'undefined' &&
				input !== skipToken && { input: input }),
			...(type && type !== 'any' && { type: type }),
		},
	];
}

function getMutationKeyInternal(path: readonly string[]) {
	return getQueryKeyInternal(path, undefined, 'any') as TRPCMutationKey;
}

type GetQueryKey<TInput = undefined> = [TInput] extends [undefined | void]
	? {
			[Procedure.queryKey]: () => TRPCQueryKey;
		}
	: {
			/**
			 * Method to extract the query key for a procedure
			 * @param type - defaults to `any`
			 */
			[Procedure.queryKey]: (input?: TInput, type?: QueryType) => TRPCQueryKey;
		} & {};

function getClientArgs<TOptions>(
	queryKey: TRPCQueryKey,
	opts: TOptions,
	infiniteParams?: {
		pageParam: any;
		direction: 'forward' | 'backward';
	}
): [path: string, input: unknown, opts: any] {
	const path = queryKey[0];
	let input = queryKey[1]?.input;
	if (infiniteParams) {
		input = {
			...(input ?? {}),
			...(infiniteParams.pageParam ? { cursor: infiniteParams.pageParam } : {}),
			direction: infiniteParams.direction,
		};
	}
	return [path.join('.'), input, (opts as any)?.trpc] as const;
}

// createUtils
type TRPCFetchQueryOptions<TOutput, TError, TData = TOutput> = DistributiveOmit<
	FetchQueryOptions<TOutput, TError, TData>,
	'queryKey'
>;

type TRPCFetchInfiniteQueryOptions<TInput, TOutput, TError> = DistributiveOmit<
	FetchInfiniteQueryOptions<TInput, TOutput, TError>,
	'queryKey' | 'initialPageParam'
>;

type QueryUtils<
	TInput = undefined,
	TOutput = undefined,
	TError = undefined
> = ExhaustiveRecord<Exclude<ValueOf<typeof Util.Query>, 'client'>, any, {
	/**
	 * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientfetchquery
	 */
	[Util.Query.fetch](
		input: TInput,
		opts?: TRPCFetchQueryOptions<TOutput, TError>
	): Promise<TOutput>;

	/**
	 * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientfetchinfinitequery
	 */
	[Util.Query.fetchInfinite](
		input: TInput,
		opts?: TRPCFetchInfiniteQueryOptions<TInput, TOutput, TError>
	): Promise<
		InfiniteData<TOutput, NonNullable<ExtractCursorType<TInput>> | null>
	>;

	/**
	 * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientprefetchquery
	 */
	[Util.Query.prefetch](
		input: TInput,
		opts?: TRPCFetchQueryOptions<TOutput, TError>
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientprefetchinfinitequery
	 */
	[Util.Query.prefetchInfinite](
		input: TInput,
		opts?: TRPCFetchInfiniteQueryOptions<TInput, TOutput, TError>
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientensurequerydata
	 */
	[Util.Query.ensureData](
		input: TInput,
		opts?: TRPCFetchQueryOptions<TOutput, TError>
	): Promise<TOutput>;

	/**
	 * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientinvalidatequeries
	 */
	[Util.Query.invalidate](
		input?: DeepPartial<TInput>,
		filters?: Omit<InvalidateQueryFilters, 'predicate'> & {
			predicate?: (
				query: Query<
					TInput,
					TError,
					TInput,
					QueryKeyKnown<
						TInput,
						TInput extends { cursor?: any } | void ? 'infinite' : 'query'
					>
				>
			) => boolean;
		},
		options?: InvalidateOptions
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientrefetchqueries
	 */
	[Util.Query.refetch](
		input?: TInput,
		filters?: RefetchQueryFilters,
		options?: RefetchOptions
	): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientcancelqueries
	 */
	[Util.Query.cancel](input?: TInput, options?: CancelOptions): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientresetqueries
	 */
	[Util.Query.reset](input?: TInput, options?: ResetOptions): Promise<void>;

	/**
	 * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientsetquerydata
	 */
	[Util.Query.setData](
		/**
		 * The input of the procedure
		 */
		input: TInput,
		updater: Updater<TOutput | undefined, TOutput | undefined>,
		options?: SetDataOptions
	): void;

	/**
	 * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientsetquerydata
	 */
	[Util.Query.setInfiniteData](
		input: TInput,
		updater: Updater<
			| InfiniteData<TOutput, NonNullable<ExtractCursorType<TInput>> | null>
			| undefined,
			| InfiniteData<TOutput, NonNullable<ExtractCursorType<TInput>> | null>
			| undefined
		>,
		options?: SetDataOptions
	): void;

	/**
	 * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientgetquerydata
	 */
	[Util.Query.getData](input?: TInput): TOutput | undefined;

	/**
	 * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientgetquerydata
	 */
	[Util.Query.getInfiniteData](
		input?: TInput
	):
		| InfiniteData<TOutput, NonNullable<ExtractCursorType<TInput>> | null>
		| undefined;
}>; // prettier-ignore

type MutationUtils<
	TInput = undefined,
	TOutput = undefined,
	TError = undefined,
> = ExhaustiveRecord<ValueOf<typeof Util.Mutation>, any, {
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
}>; // prettier-ignore

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
}; // prettier-ignore

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
	TQueryKey extends TRPCQueryKey = TRPCQueryKey,
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
	TQueryKey extends TRPCQueryKey = TRPCQueryKey,
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
	TQueryKey extends TRPCQueryKey = TRPCQueryKey,
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
type TRPCQueryOpts = {
	trpc?: {
		abortOnUnmount?: boolean;
	};
};

type CreateTRPCQueryOptions<
	TOutput,
	TError,
	TData,
	TEnv extends 'client' | 'server' = 'client'
> = Omit<CreateQueryOptions<TOutput, TError, TData>, 'queryKey' | 'queryFn'>
	& (TEnv extends 'server' ? { ssr?: boolean } : {})
	& TRPCQueryOpts
; // prettier-ignore

type CreateQueryProcedure<TInput = any, TOutput = any, TError = any> = {
	[Procedure.query]: {
		<TData = TOutput, TLazy extends boolean = false>(
			input: StoreOrVal<TInput>,
			opts?: StoreOrVal<
				CreateTRPCQueryOptions<TOutput, TError, TData> & { lazy?: TLazy }
			>
		): TLazy extends true
			? [
					CreateQueryResult<TData, TError>,
					(data?: Promise<TData>) => Promise<void>,
				]
			: CreateQueryResult<TData, TError>;

		opts: <TData = TOutput, TLazy extends boolean = false>(
			opts: CreateTRPCQueryOptions<TOutput, TError, TData> & { lazy?: TLazy }
		) => CreateTRPCQueryOptions<TOutput, TError, TData> & { lazy?: TLazy }; // prettier-ignore
	};

	[Procedure.serverQuery]: <TData = TOutput>(
		input: TInput,
		opts?: CreateTRPCQueryOptions<TOutput, TError, TData, 'server'>
	) => Promise<
		<TData = TOutput>(
			input?: StoreOrVal<TInput> | ((old: TInput) => StoreOrVal<TInput>),
			opts?: StoreOrVal<CreateTRPCQueryOptions<TOutput, TError, TData>>
		) => CreateQueryResult<TData, TError>
	>;
} & {};

type ExtractCursorType<TInput> = TInput extends { cursor?: any }
	? TInput['cursor']
	: unknown;

type CreateTRPCInfiniteQueryOptions<
	TInput,
	TOutput,
	TError,
	TData,
	TEnv extends 'client' | 'server' = 'client'
> = Omit<
			CreateInfiniteQueryOptions<TOutput, TError, TData, TData, any, ExtractCursorType<TInput>>,
			'queryKey' | 'queryFn' | 'initialPageParam'
		>
	& { initialCursor?: ExtractCursorType<TInput> }
	& (TEnv extends 'server' ? { ssr?: boolean } : {})
	& TRPCQueryOpts
; // prettier-ignore

type CreateInfiniteQueryProcedure<TInput = any, TOutput = any, TError = any> = {
	[Procedure.infiniteQuery]: {
		<TData = TOutput, TLazy extends boolean = false>(
			input: StoreOrVal<Omit<TInput, 'cursor'>>,
			opts: StoreOrVal<
				CreateTRPCInfiniteQueryOptions<TInput, TOutput, TError, TData> & {
					lazy?: TLazy;
				}
			>
		): TLazy extends true
			? [
					CreateInfiniteQueryResult<
						InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
						TError
					>,
					(data?: Promise<TData>) => Promise<void>,
				]
			: CreateInfiniteQueryResult<
					InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
					TError
				>;

		opts: <TData = TOutput>(
			opts: CreateTRPCInfiniteQueryOptions<TInput, TOutput, TError, TData>
		) => CreateTRPCInfiniteQueryOptions<TInput, TOutput, TError, TData>; // prettier-ignore
	};

	[Procedure.serverInfiniteQuery]: <TData = TOutput>(
		input: Omit<TInput, 'cursor'>,
		opts: CreateTRPCInfiniteQueryOptions<
			TInput,
			TOutput,
			TError,
			TData,
			'server'
		>
	) => Promise<
		<TData = TOutput>(
			input?:
				| StoreOrVal<Omit<TInput, 'cursor'>>
				| ((old: Omit<TInput, 'cursor'>) => StoreOrVal<Omit<TInput, 'cursor'>>),
			opts?: StoreOrVal<
				CreateTRPCInfiniteQueryOptions<TInput, TOutput, TError, TData>
			>
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
	[Procedure.mutate]: {
		(
			opts?: CreateMutationOptions<TOutput, TError, TInput, TContext>
		): CreateMutationResult<TOutput, TError, TInput, TContext>;

		opts: (
			opts: CreateMutationOptions<TOutput, TError, TInput, TContext>
		) => CreateMutationOptions<TOutput, TError, TInput, TContext>; // prettier-ignore
	};
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
	[Procedure.subscribe]: {
		(input: TInput, opts?: CreateSubscriptionOptions<TOutput, TError>): void;

		opts: (
			opts: CreateSubscriptionOptions<TOutput, TError>
		) => CreateSubscriptionOptions<TOutput, TError>; // prettier-ignore
	};
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
type UntypedClient = TRPCUntypedClient<AnyRouter>;

interface WrapperContext {
	baseClient: CreateTRPCProxyClient<AnyRouter>;
	client: UntypedClient;
	queryClient: QueryClient;
	path: string[];
	key: string;
	abortOnUnmount?: boolean;
}

function createQueriesProxy({ client, abortOnUnmount }: WrapperContext) {
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

				const queryKey = getQueryKeyInternal(this.path, input, 'query');

				return {
					...opts,
					queryKey,
					queryFn: ({ signal }) =>
						client.query(
							...getClientArgs(queryKey, {
								trpc: {
									...opts?.trpc,
									...(shouldAbortOnUnmount && { signal }),
								},
							})
						),
				} satisfies CreateQueryOptions;
			},
		}
	);
}

function getQueryType(
	utilName:
		| Exclude<keyof typeof Util.Query, 'client'>
		| keyof typeof Util.Mutation
): QueryType {
	switch (utilName) {
		case 'fetch':
		case 'ensureData':
		case 'prefetch':
		case 'getData':
		case 'setData':
			// case 'setQueriesData':
			return 'query';

		case 'fetchInfinite':
		case 'prefetchInfinite':
		case 'getInfiniteData':
		case 'setInfiniteData':
			return 'infinite';

		case 'setMutationDefaults':
		case 'getMutationDefaults':
		case 'isMutating':
		case 'cancel':
		case 'invalidate':
		case 'refetch':
		case 'reset':
			return 'any';
	}
}

const utilProcedures: Record<
	Exclude<ValueOf<typeof Util.Query>, 'client'> | ValueOf<typeof Util.Mutation>,
	(ctx: WrapperContext) => any
> = {
	// QueryUtils
	[Util.Query.fetch]: ({ path, queryClient, client, key }) => {
		return (input: any, opts?: any) => {
			const queryKey = getQueryKeyInternal(
				path,
				input,
				getQueryType(key as any)
			);
			return queryClient.fetchQuery({
				...opts,
				queryKey,
				queryFn: () => client.query(...getClientArgs(queryKey, opts)),
			});
		};
	},
	[Util.Query.fetchInfinite]: ({ path, queryClient, client, key }) => {
		return (input: any, opts?: any) => {
			const queryKey = getQueryKeyInternal(
				path,
				input,
				getQueryType(key as any)
			);
			return queryClient.fetchInfiniteQuery({
				...opts,
				queryKey,
				queryFn: ({ pageParam, direction }) => {
					return client.query(
						...getClientArgs(queryKey, opts, { pageParam, direction })
					);
				},
				initialPageParam: opts?.initialCursor ?? null,
			});
		};
	},
	[Util.Query.prefetch]: ({ path, queryClient, client, key }) => {
		return (input: any, opts?: any) => {
			const queryKey = getQueryKeyInternal(
				path,
				input,
				getQueryType(key as any)
			);
			return queryClient.prefetchQuery({
				...opts,
				queryKey,
				queryFn: () => client.query(...getClientArgs(queryKey, opts)),
			});
		};
	},
	[Util.Query.prefetchInfinite]: ({ path, queryClient, client, key }) => {
		return (input: any, opts?: any) => {
			const queryKey = getQueryKeyInternal(
				path,
				input,
				getQueryType(key as any)
			);
			return queryClient.prefetchInfiniteQuery({
				...opts,
				queryKey,
				queryFn: ({ pageParam, direction }) => {
					return client.query(
						...getClientArgs(queryKey, opts, { pageParam, direction })
					);
				},
				initialPageParam: opts?.initialCursor ?? null,
			});
		};
	},
	[Util.Query.ensureData]: ({ path, queryClient, client, key }) => {
		return (input: any, opts?: any) => {
			const queryKey = getQueryKeyInternal(
				path,
				input,
				getQueryType(key as any)
			);
			return queryClient.ensureQueryData({
				...opts,
				queryKey,
				queryFn: () => client.query(...getClientArgs(queryKey, opts)),
			});
		};
	},
	[Util.Query.invalidate]: ({ path, queryClient, key }) => {
		return (input?: any, filters?: any, options?: any) => {
			console.log(path, input, getQueryType(key as any));
			const queryKey = getQueryKeyInternal(
				path,
				input,
				getQueryType(key as any)
			);
			return queryClient.invalidateQueries(
				{
					...filters,
					queryKey,
				},
				options
			);
		};
	},
	[Util.Query.reset]: ({ queryClient, path, key }) => {
		return (input?: any, filters?: any, options?: any) => {
			const queryKey = getQueryKeyInternal(
				path,
				input,
				getQueryType(key as any)
			);
			return queryClient.resetQueries(
				{
					...filters,
					queryKey,
				},
				options
			);
		};
	},
	[Util.Query.refetch]: ({ path, queryClient, key }) => {
		return (input?: any, filters?: any, options?: any) => {
			const queryKey = getQueryKeyInternal(
				path,
				input,
				getQueryType(key as any)
			);
			return queryClient.refetchQueries(
				{
					...filters,
					queryKey,
				},
				options
			);
		};
	},
	[Util.Query.cancel]: ({ path, queryClient, key }) => {
		return (input?: any, options?: any) => {
			const queryKey = getQueryKeyInternal(
				path,
				input,
				getQueryType(key as any)
			);
			return queryClient.cancelQueries(
				{
					queryKey,
				},
				options
			);
		};
	},
	[Util.Query.setData]: ({ queryClient, path, key }) => {
		return (input: any, updater: any, options?: any) => {
			const queryKey = getQueryKeyInternal(
				path,
				input,
				getQueryType(key as any)
			);
			return queryClient.setQueryData(queryKey, updater as any, options);
		};
	},
	[Util.Query.setInfiniteData]: ({ queryClient, path, key }) => {
		return (input: any, updater: any, options?: any) => {
			const queryKey = getQueryKeyInternal(
				path,
				input,
				getQueryType(key as any)
			);
			return queryClient.setQueryData(queryKey, updater as any, options);
		};
	},
	[Util.Query.getData]: ({ queryClient, path, key }) => {
		return (input?: any) => {
			const queryKey = getQueryKeyInternal(
				path,
				input,
				getQueryType(key as any)
			);
			return queryClient.getQueryData(queryKey);
		};
	},
	[Util.Query.getInfiniteData]: ({ queryClient, path, key }) => {
		return (input?: any) => {
			const queryKey = getQueryKeyInternal(
				path,
				input,
				getQueryType(key as any)
			);
			return queryClient.getQueryData(queryKey);
		};
	},

	// MutationUtils
	[Util.Mutation.setMutationDefaults]: ({
		queryClient,
		path: _path,
		client,
	}) => {
		return (options: any) => {
			const mutationKey = getMutationKeyInternal(_path);
			const path = mutationKey[0];
			const canonicalMutationFn = (input: unknown) => {
				return client.mutation(...getClientArgs([path, { input }], {}));
			};
			return queryClient.setMutationDefaults(
				mutationKey,
				typeof options === 'function'
					? options({ canonicalMutationFn })
					: options
			);
		};
	},
	[Util.Mutation.getMutationDefaults]: ({ queryClient, path }) => {
		return () => {
			return queryClient.getMutationDefaults(getMutationKeyInternal(path));
		};
	},
	[Util.Mutation.isMutating]: ({ queryClient, path }) => {
		return () => {
			return queryClient.isMutating({
				mutationKey: getMutationKeyInternal(path),
				exact: true,
			});
		};
	},
};

function createUtilsProxy(ctx: WrapperContext) {
	return new DeepProxy(
		{},
		{
			get(_target, key, _receiver) {
				if (key === Util.Query.client) return ctx.baseClient;

				if (hasOwn(utilProcedures, key)) {
					return utilProcedures[key](
						Object.assign(ctx, { key, path: this.path })
					);
				}

				return this.nest(() => {});
			},
		}
	);
}

// CREDIT: https://svelte.dev/repl/300c16ee38af49e98261eef02a9b04a8?version=3.38.2
function effect<T extends CallableFunction, U>(
	cb: () => T | void,
	deps: () => U[]
) {
	let cleanup: T | void;

	function apply() {
		if (cleanup) cleanup();
		cleanup = cb();
	}

	if (deps) {
		let values: U[] = [];
		afterUpdate(() => {
			const new_values = deps();
			if (new_values.some((value, i) => value !== values[i])) {
				apply();
				values = new_values;
			}
		});
	} else {
		// no deps = always run
		afterUpdate(apply);
	}

	onDestroy(() => {
		if (cleanup) cleanup();
	});
}

const procedures: Record<
	ValueOf<typeof Procedure>,
	(ctx: WrapperContext) => any
> = {
	[Procedure.queryKey]: ({ path }) => {
		return (input?: any, opts?: any) => getQueryKeyInternal(path, input, opts);
	},
	[Procedure.query]: ({ path, client, abortOnUnmount, queryClient }) => {
		return (input: any, opts?: any) => {
			const isOptsStore = isSvelteStore(opts);
			const isInputStore = isSvelteStore(input);
			const currentOpts = isOptsStore ? get(opts) : opts;

			const queryKey = getQueryKeyInternal(path, input, 'query');

			if (!isInputStore && !isOptsStore && !currentOpts?.lazy) {
				const shouldAbortOnUnmount =
					opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

				return createQuery({
					...opts,
					queryKey,
					queryFn: ({ signal }) =>
						client.query(
							...getClientArgs(queryKey, {
								trpc: {
									...opts?.trpc,
									...(shouldAbortOnUnmount && { signal }),
								},
							})
						),
				});
			}

			const shouldAbortOnUnmount =
				currentOpts?.trpc?.abortOnUnmount ?? abortOnUnmount;
			const enabled = currentOpts?.lazy ? writable(false) : blankStore;

			const query = createQuery(
				derived(
					[
						isInputStore ? input : blankStore,
						isOptsStore ? opts : blankStore,
						enabled,
					],
					([$input, $opts, $enabled]) => {
						const newInput = !isBlank($input) ? $input : input;
						const newOpts = !isBlank($opts) ? $opts : opts;

						const queryKey = getQueryKeyInternal(path, newInput, 'query');

						return {
							...newOpts,
							queryKey,
							queryFn: ({ signal }) =>
								client.query(
									...getClientArgs(queryKey, {
										trpc: {
											...newOpts?.trpc,
											...(shouldAbortOnUnmount && { signal }),
										},
									})
								),
							...(!isBlank($enabled) && {
								enabled: $enabled && (newOpts?.enabled ?? true),
							}),
						} satisfies CreateQueryOptions;
					}
				)
			);

			return currentOpts?.lazy
				? [
						query,
						async (data?: any) => {
							if (data) {
								queryClient.setQueryData(queryKey, await data);
							}
							(enabled as Writable<boolean>).set(true);
						},
					]
				: query;
		};
	},
	[Procedure.serverQuery]: ({ path, client, queryClient, abortOnUnmount }) => {
		return async (_input: any, _opts?: any) => {
			let input = _input;
			let opts = _opts;
			let shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

			const queryKey = getQueryKeyInternal(path, input, 'query');

			const query: FetchQueryOptions = {
				queryKey,
				queryFn: ({ signal }) =>
					client.query(
						...getClientArgs(queryKey, {
							trpc: {
								...opts?.trpc,
								...(shouldAbortOnUnmount && { signal }),
							},
						})
					),
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
							const queryKey = getQueryKeyInternal(path, newInput, 'query');
							return {
								...newOpts,
								queryKey,
								queryFn: ({ signal }) =>
									client.query(
										...getClientArgs(queryKey, {
											trpc: {
												...newOpts?.trpc,
												...(shouldAbortOnUnmount && { signal }),
											},
										})
									),
								...($staleTime && { staleTime: $staleTime }),
							} satisfies CreateQueryOptions;
						}
					)
				);
			};
		};
	},
	[Procedure.infiniteQuery]: ({
		path,
		client,
		abortOnUnmount,
		queryClient,
	}) => {
		return (input: any, opts?: any) => {
			const isOptsStore = isSvelteStore(opts);
			const isInputStore = isSvelteStore(input);
			const currentOpts = isOptsStore ? get(opts) : opts;

			const queryKey = getQueryKeyInternal(path, input, 'infinite');

			if (!isInputStore && !isOptsStore && !currentOpts?.lazy) {
				const shouldAbortOnUnmount =
					opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

				return createInfiniteQuery({
					...opts,
					initialPageParam: opts?.initialCursor ?? null,
					queryKey,
					queryFn: ({ pageParam, signal, direction }) =>
						client.query(
							...getClientArgs(
								queryKey,
								{
									trpc: {
										...opts?.trpc,
										...(shouldAbortOnUnmount && { signal }),
									},
								},
								{
									pageParam: pageParam ?? opts.initialCursor,
									direction,
								}
							)
						),
				} satisfies CreateInfiniteQueryOptions);
			}

			const shouldAbortOnUnmount =
				currentOpts?.trpc?.abortOnUnmount ?? abortOnUnmount;
			const enabled = currentOpts?.lazy ? writable(false) : blankStore;

			const query = createInfiniteQuery(
				derived(
					[
						isInputStore ? input : blankStore,
						isOptsStore ? opts : blankStore,
						enabled,
					],
					([$input, $opts, $enabled]) => {
						const newInput = !isBlank($input) ? $input : input;
						const newOpts = !isBlank($opts) ? $opts : opts;
						const queryKey = getQueryKeyInternal(path, newInput, 'infinite');

						return {
							...newOpts,
							queryKey,
							queryFn: ({ pageParam, signal, direction }) =>
								client.query(
									...getClientArgs(
										queryKey,
										{
											trpc: {
												...newOpts?.trpc,
												...(shouldAbortOnUnmount && { signal }),
											},
										},
										{
											pageParam: pageParam ?? newOpts.initialCursor,
											direction,
										}
									)
								),
							...(!isBlank($enabled) && {
								enabled: $enabled && (newOpts?.enabled ?? true),
							}),
						} satisfies CreateInfiniteQueryOptions;
					}
				)
			);

			return currentOpts?.lazy
				? [
						query,
						async (data?: any) => {
							if (data) {
								queryClient.setQueryData(queryKey, {
									pages: [await data],
									pageParams: [currentOpts?.initialCursor ?? null],
								});
							}
							(enabled as Writable<boolean>).set(true);
						},
					]
				: query;
		};
	},
	[Procedure.serverInfiniteQuery]: ({
		path,
		client,
		queryClient,
		abortOnUnmount,
	}) => {
		return async (_input: any, _opts?: any) => {
			let input = _input;
			let opts = _opts;
			let shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;

			const queryKey = getQueryKeyInternal(path, input, 'infinite');

			const query: Omit<FetchInfiniteQueryOptions, 'initialPageParam'> = {
				queryKey,
				queryFn: ({ pageParam, signal, direction }) =>
					client.query(
						...getClientArgs(
							queryKey,
							{
								trpc: {
									...opts?.trpc,
									...(shouldAbortOnUnmount && { signal }),
								},
							},
							{
								pageParam: pageParam ?? opts.initialCursor,
								direction,
							}
						)
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
							const queryKey = getQueryKeyInternal(path, newInput, 'infinite');

							return {
								...newOpts,
								initialPageParam: newOpts?.initialCursor,
								queryKey,
								queryFn: ({ pageParam, signal, direction }) =>
									client.query(
										...getClientArgs(
											queryKey,
											{
												trpc: {
													...newOpts?.trpc,
													...(shouldAbortOnUnmount && { signal }),
												},
											},
											{
												pageParam: pageParam ?? newOpts.initialCursor,
												direction,
											}
										)
									),
								...($staleTime && { staleTime: $staleTime }),
							} satisfies CreateInfiniteQueryOptions;
						}
					)
				);
			};
		};
	},
	[Procedure.mutate]: ({ path, client, queryClient }) => {
		return (opts?: any) => {
			const mutationKey = getMutationKeyInternal(path);
			const defaultOpts = queryClient.defaultMutationOptions(
				queryClient.getMutationDefaults(mutationKey)
			);

			// TODO: Add useMutation override to `svelteQueryWrapper`
			const mutationSuccessOverride = (options: any) => options.originalFn();

			return createMutation({
				...opts,
				mutationKey,
				mutationFn: (input) =>
					client.mutation(...getClientArgs([path, { input }], opts)),
				onSuccess(...args) {
					const originalFn = () =>
						opts?.onSuccess?.(...args) ?? defaultOpts?.onSuccess?.(...args);

					return mutationSuccessOverride({
						originalFn,
						queryClient,
						meta: opts?.meta ?? defaultOpts?.meta ?? {},
					});
				},
			});
		};
	},
	[Procedure.subscribe]: ({ path, client }) => {
		return (input: any, opts?: any) => {
			const enabled = opts?.enabled ?? true;
			const queryKey = hashKey(getQueryKeyInternal(path, input, 'any'));

			effect(
				() => {
					if (!enabled) return;
					let isStopped = false;
					const subscription = client.subscription(
						path.join('.'),
						input ?? undefined,
						{
							onStarted: () => {
								if (!isStopped) opts?.onStarted?.();
							},
							onData: (data: any) => {
								if (!isStopped) opts?.onData?.(data);
							},
							onError: (err: any) => {
								if (!isStopped) opts?.onError?.(err);
							},
						}
					);
					return () => {
						isStopped = true;
						subscription.unsubscribe();
					};
				},
				() => [queryKey, enabled]
			);
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

const procedureExts = {
	[Procedure.query]: {
		opts: (opts: unknown) => opts,
	},
	[Procedure.infiniteQuery]: {
		opts: (opts: unknown) => opts,
	},
	[Procedure.mutate]: {
		opts: (opts: unknown) => opts,
	},
	[Procedure.subscribe]: {
		opts: (opts: unknown) => opts,
	},
};

interface SvelteQueryWrapperOptions<TRouter extends AnyRouter> {
	client: CreateTRPCProxyClient<TRouter>;
	queryClient?: QueryClient;
	abortOnUnmount?: boolean;
}

export function svelteQueryWrapper<TRouter extends AnyRouter>({
	client,
	queryClient: _queryClient,
	abortOnUnmount,
}: SvelteQueryWrapperOptions<TRouter>) {
	type Client = typeof client;
	type RouterError = TRPCClientErrorLike<TRouter>;
	type ClientWithQuery = AddQueryPropTypes<Client, RouterError>;

	const queryClient = _queryClient ?? useQueryClient();

	// REFER: https://github.com/trpc/trpc/blob/c6e46bbd493f0ea32367eaa33c3cabe19a2614a0/packages/client/src/createTRPCClient.ts#L143
	const innerClient = client.__untypedClient as UntypedClient;

	return new DeepProxy(
		{} as ClientWithQuery &
			(ClientWithQuery extends Record<any, any>
				? CreateUtilsProcedure<Client, RouterError> &
						CreateQueriesProcedure<Client, RouterError>
				: {}),
		{
			get() {
				return this.nest(() => {});
			},
			apply(_target, _thisArg, argList: [any]) {
				const key = this.path.pop() ?? '';

				if (key === '_def') return { path: this.path };

				if (hasOwn(procedures, key)) {
					return procedures[key]({
						baseClient: client as any,
						client: innerClient,
						path: this.path,
						queryClient,
						abortOnUnmount,
						key,
					})(...argList);
				}

				const proc = this.path.pop() ?? '';
				if (hasOwn(procedureExts, proc) && hasOwn(procedureExts[proc], key)) {
					return procedureExts[proc][key](...argList);
				}
			},
		}
	);
}
