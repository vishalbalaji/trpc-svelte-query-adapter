import type { createTRPCClient, TRPCClientInit } from "trpc-sveltekit";
import type { AnyRouter } from "@trpc/server";
import type { Router } from "svelte-app/types";

export const svelteQueryWrapper = (
	trpc: (init?: TRPCClientInit) => ReturnType<typeof createTRPCClient<Router>>
) => {
	return (init?: TRPCClientInit) => {
		const client = trpc(init)
		type Client = typeof client;

		type AddQueryPropTypes<T> = { [K in keyof T]:
			T[K] extends { query: any } ? T[K] & { useQuery: () => unknown, useInfiniteQuery: () => unknown } :
			T[K] extends { mutate: any } ? T[K] & { useMutation: () => unknown }
			: AddQueryPropTypes<T[K]> } & {}

		type NewClient = AddQueryPropTypes<Client>
		let test = {} as NewClient & { useContext: () => unknown, useQueries: () => unknown };

		return test
	}
}

