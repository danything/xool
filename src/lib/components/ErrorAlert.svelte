<script lang="ts">
import type { Snippet } from "svelte";

let { children }: { children: Snippet } = $props();
</script>

<div role="alert" class="note err">
	<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
		<title>Danger</title>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="2"
			d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
		/>
	</svg>
	<span>{@render children()}</span>
</div>

<style>
.note {
	margin-bottom: 1rem;
}
/* 線画のアイコン。色は文字と揃える */
svg {
	flex-shrink: 0;
	width: 1.5rem;
	height: 1.5rem;
	stroke: currentColor;
}
</style>
