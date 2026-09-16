<script lang="ts">
import { browser } from "$app/environment";
import { afterNavigate, beforeNavigate } from "$app/navigation";
import { updated } from "$app/state";
import Toast from "$lib/components/Toast.svelte";
import "../app.scss";

let { children, data } = $props();

// A rolling update replaces the hashed asset filenames, so a tab opened before
// the deploy asks for chunks the new pods no longer have. Without this a click
// on a link just dies; instead we hand the navigation over to the browser,
// which reloads the page against whichever version is live now.
let staleAssets = false;
let pending: string | undefined;

beforeNavigate(({ willUnload, to }) => {
	if (willUnload || !to?.url) return;
	pending = to.url.href;
	// `updated` flips once the version poll configured in vite.config.ts sees a
	// new build.
	if (staleAssets || updated.current) location.href = to.url.href;
});

afterNavigate(() => {
	pending = undefined;
});

if (browser) {
	// Vite fires this when a lazily imported chunk 404s, which happens if the
	// poll has not run yet or the request reached a pod that was already
	// replaced. Hovering a link preloads code too, so only take over when a
	// navigation is actually in flight — otherwise just remember for the next
	// click rather than reloading the page under the user.
	addEventListener("vite:preloadError", (event) => {
		event.preventDefault();
		staleAssets = true;
		if (pending) location.href = pending;
	});
}
</script>

<svelte:head>
	<title>ポスト通信簿</title>
	<meta
		name="description"
		content="前日のポストの成績を毎日まとめて自動ポストします"
	/>
</svelte:head>

<nav>
	<div class="page bar">
		<div class="grow">
			<a class="button ghost brand" href="/">ポスト通信簿</a>
		</div>
		{#if data.isAdmin}
			<div>
				<a class="button ghost mini" href="/admin">管理</a>
			</div>
		{/if}
	</div>
</nav>
<main>
	{@render children()}
</main>
<Toast />

<style>
.bar {
	display: flex;
	align-items: center;
	/* 中の余白はボタン側で持つので、ここでは横に付けない(下の .brand を参照) */
	padding-inline: 0;
	padding-block: 0.5rem;
	min-height: 4rem;
}
/*
 * 見出しの文字を本文と同じ位置に揃える。本文は左右 1rem の余白を持つので、
 * こちらは枠ではなくボタンの内側余白で同じ 1rem を作る
 */
.brand {
	padding-block: 0;
	padding-inline: 1rem;
	font-size: 1.25rem;
}
</style>
