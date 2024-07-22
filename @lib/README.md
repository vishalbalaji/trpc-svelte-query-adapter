# `tRPC` - `svelte-query` Adapter

[![NPM version][npm-image]][npm-url]
[![License][license-image]][license-url]
[![Last commit][last-commit-image]][repo-url]

> [!NOTE]
> The README on [npmjs](https://npmjs.com/trpc-svelte-query-adapter) might not be fully up to date. Please refer to
> the [README on the Github Repo](https://github.com/vishalbalaji/trpc-svelte-query-adapter/#readme) for the latest setup instructions.

This package provides an adapter to call `tRPC` procedures wrapped with <code>[@tanstack/svelte-query](https://tanstack.com/query/latest/docs/svelte/overview)</code>, similar to <code>[@trpc/react-query](https://trpc.io/docs/react-query)</code>. This is made possible using <code>[proxy-deep](https://www.npmjs.com/package/proxy-deep)</code>.

## Installation

```sh
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
- `useQueries` -> `createQueries`
- `useUtils` -> `createUtils`
- `getQueryKey`

You can refer to <code>[tanstack-query docs](https://tanstack.com/query/latest/docs/react/overview)</code> and <code>[@trpc/react-query docs](https://trpc.io/docs/react-query)</code> for documentation on how to use them.

There are also some new procedures that are only relevant for SvelteKit:

- `createServerQuery`
- `createServerInfiniteQuery`
- `createServerQueries`

As for these procedures, you can refer to the [Server-Side Query Pre-Fetching](#server-side-query-pre-fetching) section.

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

1. Setup `@tanstack/svelte-query` as per [svelte-query docs](https://tanstack.com/query/latest/docs/svelte/overview).
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

{#if $foo.isPending}
  Loading...
{:else if $foo.isError}
  Error: {$foo.error.message}
{:else if $foo.data}
  {$foo.data.message}
{/if}
```

### SvelteKit and SSR

For SvelteKit, the process is pretty much the same as for client-only svelte. However, if you intend to call queries from the server in a `load` function, you would need to setup `@tanstack/svelte-query` according to the [the ssr example in the svelte-query docs](https://tanstack.com/query/latest/docs/svelte/ssr#using-prefetchquery).

Upon doing that, you would also need to pass in the `queryClient` to `svelteQueryWrapper` when initializing on the server, which you can get by calling the `event.parent` method in the `load` function. You can see an example of this in the [Server-Side Query Pre-Fetching](#server-side-query-pre-fetching) section. For this purpose, you might also want to export your client wrapped in a function that optionally takes in `queryClient` and passes it onto `svelteQueryWrapper`.

Here is an example of what that might look like:

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
  return svelteQueryWrapper<Router>({
    client,
    queryClient
  });
};
```

Which can then be used in a component as such:

```svelte
<!-- routes/+page.svelte -->
<script lang="ts">
  import { trpc } from "$lib/trpc/client";

  const client = trpc();
  const foo = client.greeting.createQuery("foo", { retry: false });
</script>

<p>
  {#if $foo.isPending}
    Loading...
  {:else if $foo.isError}
    Error: {$foo.error.message}
  {:else}
    {$foo.data}
  {/if}
</p>
```

The main thing that needs to passed in to `svelteQueryWrapper` is the `tRPC` client itself. So, this adapter should support different implementations of `tRPC` for Svelte and SvelteKit. For example, if you are using <code>[trpc-sveltekit by icflorescu](https://icflorescu.github.io/trpc-sveltekit)</code>, all you would need to do after setting it up would be to change the client initialization function from something like this:

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

to this:

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

Which can then be initialized and used in the way that it is described [in its docs](https://icflorescu.github.io/trpc-sveltekit/getting-started).

#### Server-Side Query Pre-Fetching

This adapter provides 3 additional procedures: `createServerQuery`, `createServerInfiniteQuery` and `createServerQueries`, which can be used to call their counterpart procedures in the `load` function in either a `+page.ts` or `+layout.ts`. These procedures return a `promise` and therefore can only really be called on the server.

By default, these 3 procedures will pre-fetch the data required to pre-render the page on the server. However, if you wish to disable this behaviour on certain queries, you can do so by setting the `ssr` option to `false`.

These procedures can be used as such:

> [!NOTE] 
> [Gotta await top-level promises to pre-fetch data from SvelteKit v2](https://kit.svelte.dev/docs/migrating-to-sveltekit-2#top-level-promises-are-no-longer-awaited).

```typescript
// +page.ts
// tRPC is setup using `trpc-sveltekit` for this example.
import { trpc } from '$lib/trpc/client';
import type { PageLoad } from './$types';

export const load = (async (event) => {
  const { queryClient } = await event.parent();
  const client = trpc(event, queryClient);
  
  return {
    foo: await client.greeting.createServerQuery('foo'),
    queries: await client.createServerQueries((t) =>
      ['bar', 'baz'].map((name) => t.greeting(name, { ssr: name !== 'baz' })), // pre-fetching disabled for the `baz` query.
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

{#if $foo.isPending}
  Loading...
{:else if $foo.isError}
  {$foo.error}
{:else if $foo.data}
  {$foo.data}
{/if}
<br /><br />

{#each $queries as query}
  {#if query.isPending}
    Loading...
  {:else if query.isError}
    {query.error.message}
  {:else if query.data}
    {query.data}
  {/if}
  <br />
{/each}
```

You can also optionally pass new inputs to the queries and infinite queries  from the client side(see [#34](/../../issues/34)) like so:

```svelte
<script lang="ts">
  import { page } from "$app/stores";
  import type { PageData } from "./$types";

  export let data: PageData;

  let name = 'foo';
  let newNames: string[] = [];

  $: foo = data.foo(name); // `$` label to make the query reactive to the input

  // You can also access the default input if you pass in a callback as the new input:
  // $: foo = data.foo((old) => old + name);

  $: queries = data.queries((t, old) => [...old, ...newNames.map((name) => t.greeting(name))]);
</script>

{#if $foo.isPending}
  Loading...
{:else if $foo.isError}
  {$foo.error}
{:else if $foo.data}
  {$foo.data}
{/if}

<br />
<input bind:value={name} />

<br /><br />

{#each $queries as query}
  {#if query.isPending}
    Loading...
  {:else if query.isError}
    {query.error.message}
  {:else if query.data}
    {query.data}
  {/if}
  <br />
{/each}

<form on:submit|preventDefault={(e) => {
  const data = new FormData(e.currentTarget).get('name');
  if (typeof data === 'string') newNames.push(data);
  newNames = newNames;
}}>
  <input name="name" />
  <button type="submit">Submit</button>
</form>
```

[npm-url]: https://npmjs.org/package/trpc-svelte-query-adapter
[npm-image]: https://img.shields.io/npm/v/trpc-svelte-query-adapter.svg
[license-url]: LICENSE
[license-image]: http://img.shields.io/npm/l/trpc-svelte-query-adapter.svg
[repo-url]: https://github.com/vishalbalaji/trpc-svelte-query-adapter
[last-commit-image]: https://img.shields.io/github/last-commit/vishalbalaji/trpc-svelte-query-adapter
