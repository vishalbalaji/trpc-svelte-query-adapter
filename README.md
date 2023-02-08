# `tRPC` - `svelte-query` Adapter

This package provides an adapter to call `tRPC` procedures wrapped using `@tanstack/svelte-query`, similar to <code>[@trpc/react-query](https://trpc.io/docs/react)</code>, to be used with <code>[trpc](https://trpc.io/docs/overview)</code>. This is made possible using <code>[proxy-deep](https://www.npmjs.com/package/proxy-deep)</code>.

## Installation

```bash
# npm
npm install trpc-svelte-query-adapter @trpc/client @trpc/server @tanstact/svelte-query

# yarn
yarn add trpc-svelte-query-adapter @trpc/client @trpc/server @tanstact/svelte-query

# pnpm
pnpm install trpc-svelte-query-adapter @trpc/client @trpc/server @tanstact/svelte-query
```

If you are using client-side Svelte, you would need to install `@trpc/server` as a `devDependency`.

## Usage

The following instructions assume the `tRPC` router to be as such:

```typescript
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

export type Router = typeof router;
```

### Client-Only Svelte

1. Setup `@tanstack/svelte-query` as instructed in [svelte-query docs](https://tanstack.com/query/v4/docs/svelte/overview).
2. Setup <code>[@trpc/client](https://trpc.io/docs/client)</code> and export the `tRPC` client.
3. Wrap the exported `tRPC` client with `svelteQueryWrapper` from 'trpc-svelte-query', as demonstrated in the example below:

```typescript
// src/lib/trpc.ts
import type { Router } from '/path/to/trpc/router';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';

import { svelteQueryWrapper } from 'trpc-svelte-query-adapter';

const client = createTRPCProxyClient<Router>({
  links: [
    httpBatchLink({
      url: 'http://localhost:5000/api/v1/trpc/',
    }),
  ],
  transformer: null
});

export const trpc = svelteQueryWrapper<Router>(client);
```

4. The exported `tRPC` client can then be used in `svelte` components as follows:

```svelte
<script lang="ts">
  import { trpc } from "/path/to/lib/trpc";

  const foo = trpc.greeting.useQuery('foo', { retry: false });
</script>

{#if $foo.isLoading}
  Loading...
{:else if $foo.isError}
  Error: {$foo.error.message}
{:else if $foo.data}
  {$foo.data.message}
{/if}
```

### Sveltekit and SSR

<!-- > **NOTE:** This package is currently not hosted on `npm`. If you want to try it, you would need to clone it locally and `npm link` to it. -->

For Sveltekit, it is recommended that `tRPC` be set up using <code>[trpc-sveltekit](https://icflorescu.github.io/trpc-sveltekit/getting-started)</code>

1. Setup `@tanstack/svelte-query` as per [the ssr example in the svelte-query docs](https://tanstack.com/query/v4/docs/svelte/ssr#using-prefetchquery).
2. Setup <code>[trpc-sveltekit](https://icflorescu.github.io/trpc-sveltekit/getting-started)</code> as instructed.
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
import { useQueryClient, type QueryClient } from '@tanstack/svelte-query';

let browserClient: ReturnType<typeof svelteQueryWrapper<Router>>;

export function trpc(init?: TRPCClientInit) {
  const client = svelteQueryWrapper<Router>(
    createTRPCClient<Router>({ init }),
    queryClient ? queryClient : useQueryClient()
  );
  if (typeof window === 'undefined') return client;
  if (!browserClient) browserClient = client;
  return browserClient;
}
```

4. Finally, create your client with `trpc`.

```svelte
<!-- routes/+page.ts -->
<script lang="ts">
  import { page } from "$app/stores";
  import { trpc } from "$lib/trpc/client";

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

One caveat with SvelteKit is that server-side pre-fetching needs to happen in the `load` function in `(+page/+layout).ts`, which means that there is currently no way to implement automatic server-side query pre-fetching, at least to the extent of my SvelteKit knowledge. If you think you might have a solution potential solution for this, please feel free to open an issue or PR. Until then, though, server-side query pre-fetching can be done manually as so:

```typescript
// /path/to/route/+page.ts
import { trpcWithQuery } from '$lib/trpc/client'
import type { PageLoad } from './$types'

export const load= (async (event) => {
  const { queryClient } = await event.parent()
  const client = trpcWithQuery(event, queryClient); // You need to pass in the `queryClient` when initializing on the server.

  const utils = client.useContext()

  await utils.greeting.prefetch('foo') // This needs to be called for each query that is called in its corresponding `svelte` component.
}) satisfies PageLoad
```

## Some Notes

* This wrapper only supports `tRPC v10` onwards.
* I am aware that the `tRPC` team is already working on their own, very similar [adapter](https://www.npmjs.com/package/trpc-svelte-query). This project is not linked to that in any way. This is made purely for fun and I fully expect this project to be dead whenever `tRPC` releases their adapter.
