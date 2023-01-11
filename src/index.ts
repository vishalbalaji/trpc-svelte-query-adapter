import type { createTRPCClient, TRPCClientInit } from "trpc-sveltekit";
import type { AnyRouter } from "@trpc/server";
import type { Router } from "svelte-app/types";

type AddQueryPropTypes<T> = { [K in keyof T]:
	T[K] extends { query: any } ? T[K] & { useQuery: () => T[K]["query"], useInfiniteQuery: () => T[K]["query"] } :
	T[K] extends { mutate: any } ? T[K] & { useMutation: () => T[K]["mutate"] }
	: AddQueryPropTypes<T[K]> } & {};


export function svelteQueryWrapper(
	trpc: (init?: TRPCClientInit) => ReturnType<typeof createTRPCClient<Router>>
) {
	return (init?: TRPCClientInit) => {
		const client = trpc(init);
		type Client = typeof client;

		type NewClient = AddQueryPropTypes<Client>
		let test = {} as NewClient & { useContext: () => unknown, useQueries: () => unknown };

		return test;
	};
};
