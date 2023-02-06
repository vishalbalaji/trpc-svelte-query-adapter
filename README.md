# `tRPC` - `svelte-query` Adapter

This package provides an adapter to call `tRPC` procedures wrapped using `@tanstack/svelte-query`, similar to <code>[@trpc/react-query](https://trpc.io/docs/react)</code>, to be used with <code>[trpc-sveltekit](https://icflorescu.github.io/trpc-sveltekit/)</code>. This is made possible using <code>[proxy-deep](https://www.npmjs.com/package/proxy-deep)</code>.

## Usage

> **NOTE:** This package is currently not hosted on `npm`. If you want to try it, you would need to clone it locally and `npm link` to it.

1. Setup `tRPC` as instructed in [trpc-sveltekit docs](https://icflorescu.github.io/trpc-sveltekit/getting-started).
2. Setup `@tanstack/svelte-query` as instructed in [svelte-query docs](https://tanstack.com/query/v4/docs/svelte/overview) or as follows:

```svelte
 <!-- routes/+layout.svelte -->
<script lang="ts">
  import { browser } from "$app/environment";
  import { QueryClient, QueryClientProvider } from "@tanstack/svelte-query";

  // Make sure to disable queries on the server
  // as recommended in:
  // https://tanstack.com/query/latest/docs/svelte/ssr
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        enabled: browser,
      },
    },
  });
</script>

<QueryClientProvider client={queryClient}>
  <slot />
</QueryClientProvider>
```

3. In `$lib/trpc/client.ts`, wrap the `trpc` client with `svelteQueryWrapper` by changing:

```typescript
let browserClient: ReturnType<typeof createTRPCClient<Router>>;

export function trpc(init?: TRPCClientInit) {
  const client = createTRPCClient<Router>({ init });
  if (typeof window === 'undefined') return client;
  if (!browserClient) browserClient = client;
  return browserClient;
}
```

to:

```typescript
import { svelteQueryWrapper } from 'trpc-svelte-query-adapter';

let browserClient: ReturnType<typeof svelteQueryWrapper<Router>>;

export function trpc(init?: TRPCClientInit) {
  const client = svelteQueryWrapper<Router>(
    createTRPCClient<Router>({ init })
  )
  if (typeof window === 'undefined') return client;
  if (!browserClient) browserClient = client;
  return browserClient;
}
```

4. Finally, create your client with `trpcWithQuery` in your `svelte` components instead of with `trpc`.

```typescript
// $lib/trpc/router.ts
// Example backend route with input.
export const router = t.router({
  greeting: t.procedure
    .input((name: unknown) => {
      if (typeof name === 'string') return name;

      throw new Error(`Invalid input: ${typeof name}`);
    })
    .query(async ({ input }) => {
      return `Hello, ${input} from tRPC v10 @ ${new Date().toLocaleTimeString()}`;
    })
});
```

```svelte
<!-- routes/+page.ts -->
<script lang="ts">
  import { page } from "$app/stores";
  import { trpcWithQuery } from "$lib/trpc/client";

  const client = trpcWithQuery($page);

  const hello = client.greeting.useQuery("foo", { retry: false });
</script>

<p>
  {#if $hello.isLoading}
    Loading...
  {:else if $hello.isError}
    Error: {$hello.error.message}
  {:else}
    {$hello.data}
  {/if}
</p>
```

## Some Notes

* This wrapper only supports `tRPC v10` onwards and is intended to be used only with `trpc-sveltekit`.
* It is super early in development and has a lot of feature parity when compared to `@trpc/react-query`. See [#1](https://github.com/vishalbalaji/trpc-svelte-query-adapter/issues/1) for more details.
* This project was made purely for fun and is in no way is linked to the actual development of `tRPC` or `svelte-query`. I fully expect this project to be dead whenever `tRPC` comes up with its official wrapper.
