<script lang="ts">
import SummaryScreen from "$lib/components/SummaryScreen.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();
</script>

<SummaryScreen
	message={data.message}
	wkey={data.wkey}
	summary={data.summary}
	keyInfo={data.keyInfo}
/>
