import DeepProxy from 'proxy-deep';

// import type { AnyRouter } from '@trpc/server';
import type { Router as TRouter } from '../../../apps/svelte-app/types';
import type { createTRPCClient, TRPCClientInit } from 'trpc-sveltekit';
import {
	createQuery,
	createMutation,
	createInfiniteQuery,
	type CreateQueryOptions,
	type CreateMutationOptions,
	type CreateInfiniteQueryOptions,
} from '@tanstack/svelte-query';
import type { TRPCClientError } from '@trpc/client';

enum ProcedureNames {
	query = 'useQuery',
	infiniteQuery = 'useInfiniteQuery',
	mutate = 'useMutation',
	subscribe = 'useSubscription',
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
type QueryProcedures<TInput, TOutput, TError> = UseQueryProcedure<TInput, TOutput, TError> & UseInfiniteQueryProcedure<TInput, TOutput, TError>

type UseMutationProcedure<TInput, TOutput, TError> = {
	[ProcedureNames.mutate]: (input: TInput, opts?: CreateMutationOptions<TInput, TError>)
		=> ReturnType<typeof createMutation<Awaited<TOutput>, TError>>
}

type UseSubscriptionProcedure<TInput, TOutput, TError> = never

type AddQueryPropTypes<T, TError> = { [K in keyof T]:
	T[K] extends { query: any } ? QueryProcedures<Parameters<T[K]['query']>[0], ReturnType<T[K]['query']>, TError>
	: T[K] extends { mutate: any } ? UseMutationProcedure<Parameters<T[K]['mutate']>[0], ReturnType<T[K]['mutate']>, TError>
	: T[K] extends { subscribe: any } ? UseSubscriptionProcedure<Parameters<T[K]['subscribe']>[0], ReturnType<T[K]['subscribe']>, TError>
	: AddQueryPropTypes<T[K], TError>
};

export function svelteQueryWrapper(
	trpc: (init?: TRPCClientInit) => ReturnType<typeof createTRPCClient<TRouter>>
) {
	type RouterError = TRPCClientError<TRouter>

	return (init?: TRPCClientInit) => {
		const client = trpc(init);
		type Client = typeof client;

		type ClientWithQuery = AddQueryPropTypes<Client, RouterError> & { useContext(): unknown, useQueries: unknown }
		return new DeepProxy({} as ClientWithQuery, {
			get() {
				return this.nest(() => {})
			},

			apply(_target, _thisArg, argList) {
				const procedure = this.path.pop()
				const target = [...this.path].reduce((client, value) => client[value], client as Record<string, any>)

				if (procedure === ProcedureNames.query) {
					return createQuery(this.path, () => (target["query"] as (args: any[]) => any)(argList[0]), argList[1])
				} else if (procedure === ProcedureNames.infiniteQuery) {
					return createInfiniteQuery(this.path, () => (target["query"] as (args: any[]) => any)(argList[0]), argList[1])
				} else if (procedure === ProcedureNames.mutate) {
					return createMutation(this.path, () => (target["mutate"] as (args: any[]) => any)(argList[0]), argList[1])
				}

				return target[procedure as string]();
			}
		});
	};
};
