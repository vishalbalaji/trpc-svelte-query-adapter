import type { createTRPCClient, TRPCClientInit } from 'trpc-sveltekit';
import type { AnyRouter } from '@trpc/server';
import type { Router } from '../../../apps/svelte-app/types';
import DeepProxy from 'proxy-deep';

type Procedure = 'query' | 'mutate' | 'subscribe' | 'useQuery' | 'useInfiniteQuery' | 'useMutation'

type AddQueryPropTypes<T> = { [K in keyof T]:
	T[K] extends { query: any } ? T[K] & { useQuery: T[K]['query'], useInfiniteQuery: T[K]['query'] } :
	T[K] extends { mutate: any } ? T[K] & { useMutation: T[K]['mutate'] }
	: AddQueryPropTypes<T[K]> } & {};

export function svelteQueryWrapper(
	trpc: (init?: TRPCClientInit) => ReturnType<typeof createTRPCClient<Router>>
) {
	return (init?: TRPCClientInit) => {
		const client = trpc(init);
		type Client = typeof client;

		type NewClient = AddQueryPropTypes<Client> & { useContext: () => unknown, useQueries: () => unknown }
		let test = new DeepProxy({} as NewClient, {
			get() {
				return this.nest(function() { })
			},

			apply(_target, _thisArg, argList) {
				const procedure = this.path[this.path.length - 1] as Procedure
				console.log({ path: this.path, procedure, argList })

				if (procedure === 'query' || procedure === 'mutate' || procedure === 'subscribe') {
					const procFunc = [...this.path].reduce(
						(client, cur) => (client as unknown as Record<string, any>)[cur],
						client
					) as unknown as () => unknown

					return procFunc(...argList as [])
				}

				return 'foo';
			}
		});

		return test;
	};
};
