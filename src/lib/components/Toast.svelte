<script lang="ts">
import { toastStore } from "$lib/stores/toast.svelte";

let messageList = $state<{ id: number; text: string }[]>([]);
let isShow = $state(true);
let showTimeout: ReturnType<typeof setTimeout> | undefined;
let messageTimeout: ReturnType<typeof setTimeout> | undefined;
let nextId = 0;

$effect(() => {
	const message = toastStore.message;
	if (message) {
		isShow = true;
		nextId += 1;
		messageList = [{ id: nextId, text: message }, ...messageList];
		toastStore.message = undefined;
		if (showTimeout) clearTimeout(showTimeout);
		if (messageTimeout) clearTimeout(messageTimeout);
		showTimeout = setTimeout(() => {
			isShow = false;
		}, 1500);
		messageTimeout = setTimeout(() => {
			messageList = [];
		}, 2000);
	}
});
</script>

<div class="toast" class:hide={!isShow}>
	{#each messageList as mes (mes.id)}
		<div class="note info">
			<span>{mes.text}</span>
		</div>
	{/each}
</div>

<style>
/* 画面の右下に重ねる。中身は下から積む */
.toast {
	display: flex;
	position: fixed;
	right: 1rem;
	bottom: 1rem;
	flex-direction: column;
	gap: 0.5rem;
	width: max-content;
	max-width: calc(100vw - 2rem);
	transition: all 0.15s ease;
}
.toast.hide {
	opacity: 0;
}
</style>
