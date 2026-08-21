<script lang="ts">
import { setMessage } from "$lib/stores/toast.svelte";

let {
	fileName,
	isVisible = true,
	onDeleted,
}: {
	fileName: string;
	isVisible?: boolean;
	onDeleted?: () => void;
} = $props();

// Deleting an image cannot be undone, and the button sits on top of one in a
// grid of them. The first click only arms it -- the bin turns into a tick --
// and the second one means it.
let armed = $state(false);
let deleting = $state(false);

// Anything else you click puts it back. An armed delete button left lying
// around behind you is a trap.
$effect(() => {
	if (!armed) return;
	const disarm = () => {
		armed = false;
	};
	window.addEventListener("click", disarm);
	return () => window.removeEventListener("click", disarm);
});

async function onClickDelete(e: MouseEvent) {
	// Without this the window listener above would disarm on the very click
	// that armed it, and the gallery would open the image behind the button.
	e.stopPropagation();
	if (!armed) {
		armed = true;
		return;
	}
	armed = false;
	deleting = true;
	try {
		const res = await fetch("/lgtm/delete", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ fileName }),
		});
		if (res.ok) {
			onDeleted?.();
			setMessage("画像削除完了");
		} else {
			setMessage("画像削除失敗");
		}
	} finally {
		deleting = false;
	}
}
</script>

<button
	type="button"
	class={`btn btn-square ${armed ? "btn-error" : ""} ${
		isVisible || armed || deleting ? "" : "invisible group-hover/item:visible"
	}`}
	disabled={deleting}
	aria-label={armed ? "削除を確定" : "削除"}
	onclick={onClickDelete}
>
	{#if deleting}
		<span class="loading loading-spinner loading-sm"></span>
	{:else if armed}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-6 w-6"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<title>Confirm delete</title>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m4.5 12.75 6 6 9-13.5" />
		</svg>
	{:else}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-6 w-6"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<title>Delete</title>
			<path
				stroke-width="2"
				d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
			/>
		</svg>
	{/if}
</button>
