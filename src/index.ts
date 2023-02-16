import DeepProxy from 'proxy-deep';

import type { TRPCClientErrorLike, CreateTRPCProxyClient } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';

import {
	useQueryClient,
	createQuery,
	createMutation,
	createInfiniteQuery,
	createQueries,
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
	QueryClient,
	InvalidateOptions,
	QueryFilters,
	ResetQueryFilters,
	CreateQueryResult,
	CreateInfiniteQueryResult,
	CreateMutationResult,
} from '@tanstack/svelte-query';

import { onDestroy } from 'svelte';
import { CreateQueriesResult } from '@tanstack/svelte-query/build/lib/createQueries';

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

type GetQueryKey<TInput = undefined> = {
	getQueryKey:
	TInput extends undefined
	? () => QueryKey
	: (input: TInput, type?: QueryType) => QueryKey
}


// createContext
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
} as const;

type ContextProcedures<TInput = undefined, TOutput = undefined, TError = undefined> = {
	[ContextProcedureNames.fetch](input: TInput, opts?: FetchQueryOptions<TInput, TError, TOutput>): Promise<TOutput>
	[ContextProcedureNames.prefetch](input: TInput, opts?: FetchQueryOptions<TInput, TError, TOutput>): Promise<void>
	[ContextProcedureNames.fetchInfinite](input: TInput, opts?: FetchInfiniteQueryOptions<TInput, TError, TOutput>): Promise<InfiniteData<TOutput>>
	[ContextProcedureNames.prefetchInfinite](input: TInput, opts?: FetchInfiniteQueryOptions<TInput, TError, TOutput>): Promise<void>
	[ContextProcedureNames.invalidate](input?: TInput, filters?: InvalidateQueryFilters, options?: InvalidateOptions): Promise<void>
	[ContextProcedureNames.refetch](input?: TInput, filters?: RefetchQueryFilters, options?: RefetchOptions): Promise<void>
	[ContextProcedureNames.cancel](input?: TInput, filters?: QueryFilters, options?: CancelOptions): Promise<void>
	[ContextProcedureNames.reset](input?: TInput, filters?: ResetQueryFilters, options?: ResetOptions): Promise<void>
	[ContextProcedureNames.setData](input: TInput, updater: Updater<TOutput | undefined, TOutput | undefined>, options?: SetDataOptions): void
	[ContextProcedureNames.setInfiniteData](input: TInput, updater: Updater<InfiniteData<TOutput> | undefined, InfiniteData<TOutput> | undefined>, options?: SetDataOptions): void
	[ContextProcedureNames.getData](input?: TInput, filters?: QueryFilters): TOutput | undefined
	[ContextProcedureNames.getInfiniteData](input?: TInput, filters?: QueryFilters): InfiniteData<TOutput> | undefined
}

type AddContextPropTypes<TClient, TError> = {
	[K in keyof TClient]:
	TClient[K] extends HasQuery ? ContextProcedures<Parameters<TClient[K]['query']>[0], Awaited<ReturnType<TClient[K]['query']>>, TError>
	: AddContextPropTypes<TClient[K], TError> & Pick<ContextProcedures, typeof ContextProcedureNames.invalidate>
};

type CreateContext<TClient, TError> = AddContextPropTypes<OnlyQueries<TClient>, TError>
	& Pick<ContextProcedures, typeof ContextProcedureNames.invalidate>
	& { [ContextProcedureNames.client]: TClient }


// createQueries
type CreateQueryOptionsForCreateQueries<TInput, TError> =
	Omit<CreateQueryOptions<TInput, TError>, 'context'>

type CreateQueriesRecord<TClient, TError> = { [K in keyof TClient]:
	TClient[K] extends HasQuery
	? (input: Parameters<TClient[K]['query']>[0], opts?: CreateQueryOptionsForCreateQueries<Awaited<ReturnType<TClient[K]['query']>>, TError>)
		=> CreateQueryOptionsForCreateQueries<Awaited<ReturnType<TClient[K]['query']>>, TError>
	: CreateQueriesRecord<TClient[K], TError>
}

type CreateQueries<TClient, TError> = <TOpts extends CreateQueryOptionsForCreateQueries<any, any>[]>(
	queriesCallback: (t: CreateQueriesRecord<OnlyQueries<TClient>, TError>) => readonly [...TOpts]
) => CreateQueriesResult<TOpts>

type CreateServerQueries<TClient, TError> = <TOpts extends CreateQueryOptionsForCreateQueries<any, any>[]>(
	queriesCallback: (t: CreateQueriesRecord<OnlyQueries<TClient>, TError>) => readonly [...TOpts]
) => Promise<() => CreateQueriesResult<TOpts>>

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
	queries: 'createQueries',
	serverQueries: 'createServerQueries',
} as const;

type CreateQueryProcedure<TInput, TOutput, TError> = {
	[ProcedureNames.query]: (input: TInput, opts?: CreateQueryOptions<TOutput, TError>)
		=> CreateQueryResult<TOutput, TError>,
	[ProcedureNames.serverQuery]: (input: TInput, opts?: CreateQueryOptions<TOutput, TError>)
		=> Promise<() => CreateQueryResult<TOutput, TError>>,
}

type CreateInfiniteQueryProcedure<TInput, TOutput, TError> = TInput extends { cursor?: any }
	? {
		[ProcedureNames.infiniteQuery]: (input: Omit<TInput, 'cursor'>, opts?: CreateInfiniteQueryOptions<TOutput, TError>)
			=> CreateInfiniteQueryResult<TOutput, TError>,
		[ProcedureNames.serverInfiniteQuery]: (input: Omit<TInput, 'cursor'>, opts?: CreateInfiniteQueryOptions<TOutput, TError>)
			=> Promise<() => CreateInfiniteQueryResult<TOutput, TError>>,
	}
	: {}

type QueryProcedures<TInput, TOutput, TError> = CreateQueryProcedure<TInput, TOutput, TError> & CreateInfiniteQueryProcedure<TInput, TOutput, TError> & GetQueryKey<TInput>

type CreateMutationProcedure<TInput, TOutput, TError, TContext = unknown> = {
	[ProcedureNames.mutate]: (opts?: CreateMutationOptions<TOutput, TError, TInput, TContext>)
		=> CreateMutationResult<TOutput, TError, TInput, TContext>
}

type CreateTRPCSubscriptionOptions<TOutput, TError> = {
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
	[ProcedureNames.subscribe]: (input: TInput, opts?: CreateTRPCSubscriptionOptions<TOutput, TError>)
		=> void
}

type AddQueryPropTypes<TClient, TError> = TClient extends Record<any, any> ? {
	[K in keyof TClient]:
	TClient[K] extends HasQuery ? QueryProcedures<Parameters<TClient[K]['query']>[0], Awaited<ReturnType<TClient[K]['query']>>, TError>
	: TClient[K] extends HasMutate ? CreateMutationProcedure<Parameters<TClient[K]['mutate']>[0], Awaited<ReturnType<TClient[K]['mutate']>>, TError>
	: TClient[K] extends HasSubscribe ? CreateSubscriptionProcedure<Parameters<TClient[K]['subscribe']>[0], GetSubscriptionOutput<Parameters<TClient[K]['subscribe']>[1]>, TError>
	: AddQueryPropTypes<TClient[K], TError> & GetQueryKey
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

const contextProcedures = {
	[ContextProcedureNames.fetch]: ({ path, queryClient, target }) => {
		return (input: any, opts?: any) => {
			return queryClient.fetchQuery({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'query'),
				queryFn: () => target.query(input),
			});
		};
	},
	[ContextProcedureNames.prefetch]: ({ path, queryClient, target }) => {
		return (input: any, opts?: any) => {
			return queryClient.prefetchQuery({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'query'),
				queryFn: () => target.query(input),
			});
		};
	},
	[ContextProcedureNames.fetchInfinite]: ({ path, queryClient, target }) => {
		return (input: any, opts?: any) => {
			return queryClient.fetchInfiniteQuery({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'infinite'),
				queryFn: ({ pageParam }) => target.query({ ...input, cursor: pageParam }),
			});
		};
	},
	[ContextProcedureNames.prefetchInfinite]: ({ path, queryClient, target }) => {
		return (input: any, opts?: any) => {
			return queryClient.prefetchInfiniteQuery({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'infinite'),
				queryFn: ({ pageParam }) => target.query({ ...input, cursor: pageParam }),
			});
		};
	},
	[ContextProcedureNames.invalidate]: ({ path, queryClient }) => {
		return (input?: any, filters?: any, options?: any) => {
			return queryClient.invalidateQueries({
				...filters,
				queryKey: getArrayQueryKey(path, input, 'any'),
			}, options);
		};
	},
	[ContextProcedureNames.refetch]: ({ path, queryClient }) => {
		return (input?: any, filters?: any, options?: any) => {
			return queryClient.refetchQueries({
				...filters,
				queryKey: getArrayQueryKey(path, input, 'any'),
			}, options);
		};
	},
	[ContextProcedureNames.cancel]: ({ path, queryClient }) => {
		return (input?: any, filters?: any, options?: any) => {
			return queryClient.cancelQueries(
				getArrayQueryKey(path, input, 'any'),
				filters,
				options
			);
		};
	},
	[ContextProcedureNames.reset]: ({ queryClient, path }) => {
		return (input?: any, filters?: any, options?: any) => {
			return queryClient.resetQueries(
				getArrayQueryKey(path, input, 'any'),
				filters,
				options
			);
		};
	},
	[ContextProcedureNames.setData]: ({ queryClient, path }) => {
		return (input: any, updater: any, options?: any) => {
			return queryClient.setQueryData(
				getArrayQueryKey(path, input, 'query'),
				updater,
				options
			);
		};
	},
	[ContextProcedureNames.setInfiniteData]: ({ queryClient, path }) => {
		return (input: any, updater: any, options?: any) => {
			return queryClient.setQueryData(
				getArrayQueryKey(path, input, 'infinite'),
				updater,
				options
			);
		};
	},
	[ContextProcedureNames.getData]: ({ queryClient, path }) => {
		return (input?: any, filters?: any) => {
			return queryClient.getQueryData(
				getArrayQueryKey(path, input, 'query'),
				filters
			);
		};
	},
	[ContextProcedureNames.getInfiniteData]: ({ queryClient, path }) => {
		return (input?: any, filters?: any) => {
			return queryClient.getQueryData(
				getArrayQueryKey(path, input, 'infinite'),
				filters
			);
		};
	},
};

function createContextProxy(client: any, queryClient: QueryClient) {
	return new DeepProxy({}, {
		get(_target, key, _receiver) {
			if (key === ContextProcedureNames.client) return client;

			if (Object.hasOwn(contextProcedures, key)) {
				const target = [...this.path].reduce((client, value) => client[value], client as Record<PropertyKey, any>);
				return contextProcedures[key]({ path: this.path, target, queryClient });
			}

			return this.nest(() => { });
		},
	});
}

const procedures = {
	[ProcedureNames.queryKey]: ({ path }) => {
		return (input: any, opts?: any) => getArrayQueryKey(path, input, opts);
	},
	[ProcedureNames.query]: ({ path, target }) => {
		const targetFn = target.query;

		return (input: any, opts?: any) => {
			return createQuery({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'query'),
				queryFn: () => targetFn(input),
			});
		};
	},
	[ProcedureNames.serverQuery]: ({ path, target }) => {
		const targetFn = target.query;

		return async (input: any, opts?: any) => {
			const initialData = await targetFn(input);
			return () => createQuery({
				...opts,
				refetchOnMount: false,
				queryKey: getArrayQueryKey(path, input, 'query'),
				queryFn: () => targetFn(input),
				initialData,
			});
		};
	},
	[ProcedureNames.infiniteQuery]: ({ path, target }) => {
		return (input: any, opts?: any) => {
			return createInfiniteQuery({
				...opts,
				queryKey: getArrayQueryKey(path, input, 'infinite'),
				queryFn: ({ pageParam }) => target.query({ ...input, cursor: pageParam }),
			});
		};
	},
	[ProcedureNames.serverInfiniteQuery]: ({ path, target }) => {
		const targetFn = target.query;

		return async (input: any, opts?: any) => {
			const initialData = await targetFn(input);
			return () => createInfiniteQuery({
				...opts,
				refetchOnMount: false,
				queryKey: getArrayQueryKey(path, input, 'infinite'),
				queryFn: ({ pageParam }) => target.query({ ...input, cursor: pageParam }),
				initialData,
			});
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
					if (!isStopped) opts.onStarted?.();
				},
				onData: (data: any) => {
					if (!isStopped) opts.onData?.(data);
				},
				onError: (err: any) => {
					if (!isStopped) opts.onError?.(err);
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
			return createQueries(input(queriesProxy));
		};
	},
	[ProcedureNames.serverQueries]: ({ path, queriesProxy }) => {
		if (path.length !== 0) return;
		return async (input: (...args: any[]) => any) => {
			const queryKeys = await Promise.all(
				input(queriesProxy).map(async (query: any) => {
					return {
						...query,
						refetchOnMount: false,
						initialData: await query.queryFn(),
					};
				})
			);
			return () => createQueries(queryKeys);
		};
	},
	[ProcedureNames.context]: ({ path, contextProxy }) => {
		if (path.length !== 0) return;
		return () => contextProxy;
	},
};

export function svelteQueryWrapper<TRouter extends AnyRouter>({
	client,
	queryClient,
}: { client: CreateTRPCProxyClient<TRouter>, queryClient?: QueryClient }) {

	type Client = typeof client;
	type RouterError = TRPCClientErrorLike<TRouter>;
	type ClientWithQuery = AddQueryPropTypes<Client, RouterError>;

	const queriesProxy = createQueriesProxy(client);
	const contextProxy = createContextProxy(client, queryClient ?? useQueryClient());

	return new DeepProxy({} as ClientWithQuery &
		(ClientWithQuery extends Record<any, any> ?
			{
				createContext(): CreateContext<Client, RouterError>,
				createQueries: CreateQueries<Client, RouterError>
				createServerQueries: CreateServerQueries<Client, RouterError>
			} : {}),
	{
		get(_, key) {
			if (Object.hasOwn(procedures, key)) {
				const target = [...this.path].reduce((client, value) => client[value], client as Record<PropertyKey, any>);
				return procedures[key]({ path: this.path, target, queriesProxy, contextProxy });
			}
			return this.nest(() => { });
		},
	}
	);
}
