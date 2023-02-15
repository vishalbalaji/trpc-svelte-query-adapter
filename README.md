# `tRPC` - `svelte-query` Adapter

> **NOTE:** The README on [npmjs](https://npmjs.com/) might not be fully up to date. Please refer to the [README on the Github Repo](https://github.com/vishalbalaji/trpc-svelte-query-adapter/#readme) for the latest setup instructions.

This package provides an adapter to call `tRPC` procedures wrapped with <code>[@tanstack/svelte-query](https://tanstack.com/query/v4/docs/svelte/overview)</code>, similar to <code>[@trpc/react-query](https://trpc.io/docs/react)</code>. This is made possible using <code>[proxy-deep](https://www.npmjs.com/package/proxy-deep)</code>.

## Installation

```bash
# npm
npm install trpc-svelte-query-adapter @trpc/client @trpc/server @tanstack/svelte-query

# yarn
yarn add trpc-svelte-query-adapter @trpc/client @trpc/server @tanstack/svelte-query

# pnpm
pnpm add trpc-svelte-query-adapter @trpc/client @trpc/server @tanstack/svelte-query
```

If you are using client-side Svelte, you would need to install `@trpc/server` as a `devDependency` using `--save-dev`.

## Available Functions

The following functions from `@trpc/react-query` are ported over:

- `useQuery`
- `useInfiniteQuery`
- `useMutation`
- `useSubscription`
- `getQueryKey`
- `useContext`
- `useQueries`

You can refer to <code>[tanstack-query docs](https://tanstack.com/query/latest/docs/react/overview)</code> and <code>[@trpc/react-query docs](https://trpc.io/docs/react)</code> for documentation on how to use them.

> **NOTE:** Currently, the main procedure names reflect those of `@trpc/react-query` as supposed to `@tanstack/svelte-query` to make it easier to cross-reference with `@trpc/react-query` during development. This is temporary and will be fixed in a future update.

## Usage

The following instructions assume the `tRPC` router to have the following procedures:

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

1. Setup `@tanstack/svelte-query` as per [svelte-query docs](https://tanstack.com/query/v4/docs/svelte/overview).
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
	  // Replace this URL with that of your tRPC server
      url: 'http://localhost:5000/api/v1/trpc/',
    }),
  ],
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

For Sveltekit, it is recommended that `tRPC` be set up using <code>[trpc-sveltekit](https://icflorescu.github.io/trpc-sveltekit/getting-started)</code>.

1. Setup `@tanstack/svelte-query` as per [the ssr example in the svelte-query docs](https://tanstack.com/query/v4/docs/svelte/ssr#using-prefetchquery).
2. Setup <code>[trpc-sveltekit](https://icflorescu.github.io/trpc-sveltekit/getting-started)</code> as per docs.
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

export function trpc(init?: TRPCClientInit, queryClient?: QueryClient) {
  const client = svelteQueryWrapper<Router>(
    createTRPCClient<Router>({ init }),
    queryClient ? queryClient : useQueryClient()
  );
  if (typeof window === 'undefined') return client;
  if (!browserClient) browserClient = client;
  return browserClient;
}
```

4. Finally, create your client with the exported `trpc` function.

```svelte
<!-- routes/+page.ts -->
<script lang="ts">
  import { page } from "$app/stores";
  import { trpc } from "$lib/trpc/client";

  const client = trpc($page);

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

One caveat with SvelteKit is that server-side pre-fetching needs to happen in the `load` function in `(+page/+layout).ts`, which means that there is currently no way to implement automatic server-side query pre-fetching, at least with how this library is implemented. If you think you might have a potential solution for this, please feel free to open an issue or PR.

Until then, server-side query pre-fetching can be done manually as so:

```typescript
// /path/to/route/+page.ts
import { trpc } from '$lib/trpc/client'
import type { PageLoad } from './$types'

export const load = (async (event) => {
  const { queryClient } = await event.parent();
  const client = trpc(event, queryClient); // `queryClient` needs to be passed when initializing on the server.

  const utils = client.useContext();

  await utils.greeting.prefetch('foo') // This needs to be called for each query that is called in its corresponding `svelte` component.
}) satisfies PageLoad
```

## Some Notes

* This wrapper only supports `tRPC v10` onwards.
* This project was made purely for fun and not linked to official `tRPC` or `tanstack-query` development in any way. If any official adapters of this sort were to be released, this project would most likely be discontinued.
