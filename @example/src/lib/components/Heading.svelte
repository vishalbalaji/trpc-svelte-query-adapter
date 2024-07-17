<script>
	import { House, CaretRight } from 'phosphor-svelte';
</script>

<div style="display:flex;align-items:center;gap:1rem;">
	<button
		class="outline contrast"
		style="border:none; outline:none; padding:0;"
	>
		<a href="/" style="color:white!important;">
			<House />
		</a>
	</button>
	<span>
		<CaretRight />
	</span>
	<h1 style="margin:0"><slot /></h1>
</div>
