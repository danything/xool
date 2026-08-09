<script lang="ts">
import LgtmScreen from "$lib/components/LgtmScreen.svelte";
import SummaryScreen from "$lib/components/SummaryScreen.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

{#if data.site === "lgtm"}
	<LgtmScreen
		message={data.message}
		wkey={data.wkey}
		ghLogin={data.ghLogin}
		xLinked={data.xLinked}
		recentImages={data.recentImages}
		myImages={data.myImages}
	/>
{:else}
	<SummaryScreen
		message={data.message}
		wkey={data.wkey}
		summary={data.summary}
		keyInfo={data.keyInfo}
	/>
{/if}
