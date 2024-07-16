<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let name = 'foo';
	$: query = data.query(name);
</script>

<pre>
{JSON.stringify($query, null, 2)}
</pre>

<input type="text" bind:value={name} />
{$query.data}
