# `tRPC` - `svelte-query` Adapter

This adapter provides a thin wrapper to call `tRPC` procedures wrapped using `@tanstack/svelte-query`, similar to <code>[@trpc/react-query](https://trpc.io/docs/react)</code>, to be used with <code>[trpc-sveltekit](https://icflorescu.github.io/trpc-sveltekit/)</code>. This is made possible using <code>[proxy-deep](https://www.npmjs.com/package/proxy-deep)</code>.

> **NOTE: this wrapper does not support `tRPC` v9 and is intended to be used only with `trpc-sveltekit`. It is also super early in development and has a lot of feature parity when compared to `@trpc/react-query`.**

## Usage

1. Setup `tRPC` as instructed in [trpc-sveltekit docs](https://icflorescu.github.io/trpc-sveltekit/getting-started).
2. In `$lib/trpc/client.ts`, wrap the `trpc` function with `svelteQueryWrapper` by changing:

```typescript
export function trpc(init?: TRPCClientInit) {
  if (typeof window === 'undefined') return createTRPCClient<Router>({ init });
  if (!browserClient) browserClient = createTRPCClient<Router>();
  return browserClient;
}
```

to:

```typescript
export const trpc = (init?: TRPCClientInit) => {
	if (typeof window === 'undefined') return createTRPCClient<Router>({ init });
	if (!browserClient) browserClient = createTRPCClient<Router>();
	return browserClient;
}

export const trpcWithQuery = svelteQueryWrapper<Router>(trpc) // Providing your `Router` type as a param is crucial.
```

3. Finally, create your client with `trpcWithQuery` in your `svelte` components instead of with `trpc`.
