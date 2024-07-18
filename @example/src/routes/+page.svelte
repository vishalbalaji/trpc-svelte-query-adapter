<script>
	import Heading from '$lib/components/Heading.svelte';
</script>

<div style="display:flex;flex-direction:column;gap:2rem;">
	<div style="display:flex;align-items:center;justify-content:space-between;">
		<Heading prefix={false}>
			tRPC - Svelte-Query Adapter Demo
		</Heading>
	</div>

	<div>
		<h2>Examples</h2>
		<ul>
			<li><a href="/client-only">Client-only</a></li>
			<li><a href="/ssr">SSR</a></li>
		</ul>
	</div>
</div>
