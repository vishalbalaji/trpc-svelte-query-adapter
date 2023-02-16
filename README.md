# `tRPC` - `svelte-query` Adapter

***Now with automatic server-side query pre-fetching!... Kind of.***

> **NOTE:** The README on [npmjs](https://npmjs.com/trpc-svelte-query-adapter) might not be fully up to date. Please refer to the [README on the Github Repo](https://github.com/vishalbalaji/trpc-svelte-query-adapter/#readme) for the latest setup instructions.

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

- `useQuery` -> `createQuery`
- `useInfiniteQuery` -> `createInfiniteQuery`
- `useMutation` -> `createMutation`
- `useSubscription` -> `createSubscription`
- `useContext` -> `createContext`
- `useContext` -> `createQueries`
- `getQueryKey`

You can refer to <code>[tanstack-query docs](https://tanstack.com/query/latest/docs/react/overview)</code> and <code>[@trpc/react-query docs](https://trpc.io/docs/react)</code> for documentation on how to use them.

There are also some new procedures that are only relevant for SvelteKit:

- `createServerQuery`
- `createServerInfiniteQuery`
- `createServerQueries`

As for these procedures, you can refer to the [SvelteKit and SSR](#sveltekit-and-ssr)  section.

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
3. Wrap the exported `tRPC` client with `svelteQueryWrapper` from `trpc-svelte-query-adapter`, as demonstrated in the example below:

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

export const trpc = svelteQueryWrapper<Router>({ client });
```

4. The exported `tRPC` client can then be used in `svelte` components as follows:

```svelte
<script lang="ts">
  import { trpc } from "/path/to/lib/trpc";

  const foo = trpc.greeting.createQuery('foo', { retry: false });
</script>

{#if $foo.isLoading}
  Loading...
{:else if $foo.isError}
  Error: {$foo.error.message}
{:else if $foo.data}
  {$foo.data.message}
{/if}
```

### SvelteKit and SSR

For SvelteKit, it is recommended that `tRPC` be set up using <code>[trpc-sveltekit](https://icflorescu.github.io/trpc-sveltekit/getting-started)</code>.

1. Setup `@tanstack/svelte-query` as per [the ssr example in the svelte-query docs](https://tanstack.com/query/v4/docs/svelte/ssr#using-prefetchquery).
2. Setup <code>[trpc-sveltekit](https://icflorescu.github.io/trpc-sveltekit/getting-started)</code> as per docs.
3. In `$lib/trpc/client.ts`, wrap the `trpc` client with `svelteQueryWrapper` by changing:

```typescript
let browserClient: ReturnType<typeof createTRPCClient<Router>>;

export function trpc(init?: TRPCClientInit) {
  const isBrowser = typeof window !== 'undefined';
  if (isBrowser && browserClient) return browserClient;
  const client = createTRPCClient<Router>({ init });
  if (isBrowser) browserClient = client;
  return client;
}
```

to:

```typescript
import { svelteQueryWrapper } from 'trpc-svelte-query-adapter';
import type { QueryClient } from '@tanstack/svelte-query';

let browserClient: ReturnType<typeof svelteQueryWrapper<Router>>;

export function trpc(init?: TRPCClientInit, queryClient?: QueryClient) {
  const isBrowser = typeof window !== 'undefined';
  if (isBrowser && browserClient) return browserClient;
  const client = svelteQueryWrapper<Router>({
    client: createTRPCClient<Router>({ init }),
    queryClient
  });
  if (isBrowser) browserClient = client;
  return client;
}
```

4. Finally, create your client with the exported `trpc` function and use it in a component.

```svelte
<!-- routes/+page.ts -->
<script lang="ts">
  import { page } from "$app/stores";
  import { trpc } from "$lib/trpc/client";

  const client = trpc($page);
  const hello = client.greeting.createQuery("foo", { retry: false });
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

If you are not using `trpc-sveltekit`, just make sure that you are wrapping your `tRPC` client with `svelteQueryWrapper` using a similar function, as passing `queryClient` when calling on the server is crucial. Here is an example of what that might look like:

```typescript
import type { QueryClient } from '@tanstack/svelte-query';

const client = createTRPCProxyClient<Router>({
  links: [
    httpBatchLink({
	  // Replace this URL with that of your tRPC server
      url: 'http://localhost:5000/api/v1/trpc/',
    }),
  ],
});

export function trpc(queryClient?: QueryClient) {
  svelteQueryWrapper<Router>({
	  client,
	  queryClient
  });
};
```

#### Server-Side Query Pre-Fetching

This adapter provides 3 additional procedures: `createServerQuery`, `createServerInfiniteQuery` and `createServerQueries`, which can be used to call their counterpart procedures in a `load` function in either a `+(page/layout).ts`. These procedures return a `promise` and therefore cannot only really be called on the server.

These procedures can be used as such:

> **NOTE:** You can await the procedures first, but it is better to pass the promises directly as SvelteKit automatically resolves all these promises at the same time. [This excellent video by **Huntabyte**](https://www.youtube.com/watch?v=Ymk22rD8Lb4) explains this in detail.

```typescript
// +page.ts
import { trpcWithQuery } from '$lib/trpc/client';
import type { PageLoad } from './$types';

export const load = (async (event) => {
  const { queryClient } = await event.parent();
  const client = trpcWithQuery(event, queryClient);
  
  return {
    foo: client.greeting.createServerQuery('foo'),
    queries: client.createServerQueries((t) =>
      ["hi", "hello"].map((name) => t.greeting(name))
    ),
  };
}) satisfies PageLoad
```

Then, in the component:

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { page } from "$app/stores";
  import type { PageData } from "./$types";

  export let data: PageData;

  const foo = data.foo();
  const queries = data.queries();
</script>

{#if $foo.isLoading}
  Loading...
{:else if $foo.isError}
  {$foo.error}
{:else if $foo.data}
  {$foo.data}
{/if}
<br />

{#each $queries as query}
  {#if query.isLoading}
    Loading...
  {:else if query.isError}
    {query.error.message}
  {:else if query.data}
    {query.data}
  {/if}
  <br />
{/each}
```

## Some Notes

* This wrapper only supports `tRPC v10` onward.
* This project was made purely for fun and not linked to official `tRPC` or `tanstack-query` development in any way. If any official adapters of this sort were to be released, this project would most likely be discontinued.
