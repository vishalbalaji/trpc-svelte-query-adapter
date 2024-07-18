<script>
	import { House, CaretRight, GithubLogo } from 'phosphor-svelte';

	export let prefix = true;
	export let suffix = true;
</script>

<div style="display:flex;align-items:center;gap:1rem;width:100%;">
	{#if prefix}
		<button
			class="outline contrast"
			style="border:none; outline:none; padding:0;"
		>
			<a href="/">
				<House />
			</a>
		</button>
		<span>
			<CaretRight />
		</span>
	{/if}

	<h1 style="margin:0"><slot /></h1>

	{#if suffix}
		<div style="margin-left:auto;">
			<a
				href="https://github.com/vishalbalaji/trpc-svelte-query-adapter"
				target="_blank"
				title="Github page"
			>
				<GithubLogo size="1.5rem" />
			</a>
		</div>
	{/if}
</div>
