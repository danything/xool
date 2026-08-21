<script lang="ts" module>
export type File = { name: string; isDeletable: boolean };
</script>

<script lang="ts">
	import { untrack } from "svelte";
	import { PER_PAGE } from "$lib/paging";
	import CopyButton from "./CopyButton.svelte";
	import DeleteButton from "./DeleteButton.svelte";

	let {
		fileNameList,
		userKey,
		find,
	}: {
		fileNameList: File[];
		userKey?: string;
		find: boolean;
	} = $props();

	// Seeds SSR output with the initial page; the $effect below only
	// re-syncs on later prop changes (e.g. switching tabs), client-side.
	// Reading the prop through untrack says that capturing just this first
	// value is the point, rather than an oversight the compiler should flag.
	let items = $state<File[]>(untrack(() => fileNameList));
	let page = $state(2);
	let isGetting = $state(false);
	let diaImage = $state<File>();
	let dialog: HTMLDialogElement | undefined = $state();
	// Filled in from the preview image once it loads; see the dialog below for
	// why its own proportions are needed to size it. Deliberately not cleared
	// when the dialog opens: reopening the same picture leaves src untouched, so
	// no load event follows to put the numbers back, and the preview would fall
	// back to the raw file size. Picking a different one does change src, and
	// its load event overwrites these.
	let previewW = $state(0);
	let previewH = $state(0);

	function onClickItem(file: File) {
		diaImage = file;
		dialog?.showModal();
	}
	function closeDialog() {
		dialog?.close();
	}

	// Read at click time, when `location` exists.
	function lgtmMarkdown(fileName: string) {
		return `![LGTM](${window.location.origin}/images/${fileName})`;
	}

	function removeItem(fileName: string) {
		items = items.filter((f) => f.name !== fileName);
	}

	async function handleScroll() {
		if (
			document.body.scrollHeight - (window.innerHeight + window.scrollY) <
				300 &&
			!isGetting
		) {
			isGetting = true;
			const res = await fetch(`/lgtm/images?page=${page}&find=${find}`);
			const pageList: File[] = await res.json();
			items = [...items, ...pageList];
			page += 1;
			// A short page is the last one, so leaving this set stops the scroll
			// handler from asking again.
			if (pageList.length === PER_PAGE) isGetting = false;
		}
	}

	$effect(() => {
		items = [...fileNameList];
		page = 2;
		isGetting = false;
		// handleScroll reads isGetting and page, which this effect has just
		// written. Tracking those reads made the effect depend on its own
		// writes: the first pass set isGetting = true, that invalidated the
		// effect, and the re-run reset page back to 2 and fetched again. Only
		// fileNameList above is meant to re-trigger this, so kick the initial
		// fill off outside the tracking scope.
		untrack(handleScroll);
		window.addEventListener("scroll", handleScroll);
		return () => {
			window.removeEventListener("scroll", handleScroll);
		};
	});
</script>

<div class="flex flex-wrap gap-3 overflow-x-hidden py-3">
	{#each items as file (file.name)}
		<!--
			The copy and delete buttons overlay the tile, so they have to be
			positioned against it -- but they cannot be *inside* it while the tile
			is itself a <button>. Nested buttons are invalid, and the parser
			resolves them by closing the outer one early, which left the tile empty
			and threw the image and the overlays out into the row. Keep the tile as
			a plain positioned element and let the image be the button.
		-->
		<div
			class="relative grow h-64 max-w-lg rounded-lg overflow-hidden bg-primary-content hover:scale-105 transition-all"
		>
			<button
				class="block h-full w-full cursor-pointer"
				onclick={() => onClickItem(file)}
				type="button"
			>
				<img
					src={`/images/${file.name}`}
					alt="LGTM"
					class="h-full w-full object-cover"
					width="960"
					height="960"
				/>
			</button>
			<!-- One row, so the two never have to know each other's size: delete
			     sits to the left of copy, and an armed delete grows leftwards
			     from the right edge rather than pushing copy along. -->
			<div class="absolute right-3 top-3 flex gap-2">
				{#if file.isDeletable}
					<DeleteButton
						fileName={file.name}
						onDeleted={() => removeItem(file.name)}
					/>
				{/if}
				<CopyButton text={() => lgtmMarkdown(file.name)} />
			</div>
		</div>
	{/each}
</div>
<dialog bind:this={dialog} class="modal">
	<!--
		modal-box caps itself at 32rem, which left the preview barely wider than a
		tile. Let it grow to the viewport instead, and size the image below so a
		tall one is bounded by height rather than overflowing.
	-->
	<div class="modal-box w-auto max-w-[92vw] p-2">
		<div class="relative group/item">
			{#if diaImage}
				<div class="absolute right-3 top-3 flex gap-2">
					{#if diaImage.isDeletable}
						<DeleteButton
							fileName={diaImage.name}
							isVisible={false}
							onDeleted={() => {
								if (diaImage) removeItem(diaImage.name);
								closeDialog();
							}}
						/>
					{/if}
					<CopyButton
						text={() => lgtmMarkdown(diaImage?.name ?? "")}
						onClick={closeDialog}
						isVisible={false}
					/>
				</div>
				<!--
					Uploads are capped at 960px but most are well under it, and leaving
					the width to the image renders those at 1:1 -- a 500px wide one sat
					in an 8% corner of the screen. Asking for a width instead doesn't
					work either: a max-height then clamps the height without pulling the
					width back with it, and the picture stretches. So take the width from
					the image's own proportions, picking whichever of the two limits
					binds first. It fills the window, keeps its shape, and never spills.
				-->
				<img
					src={`/images/${diaImage.name}`}
					alt="LGTM"
					width="960"
					height="960"
					bind:naturalWidth={previewW}
					bind:naturalHeight={previewH}
					style={previewW && previewH
						? `width: min(86vw, calc(88vh * ${previewW / previewH}))`
						: undefined}
					class="block h-auto max-h-[88vh] max-w-[86vw]"
				/>
			{:else}
				<div class="skeleton h-full w-full"></div>
			{/if}
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button type="button" onclick={closeDialog}>close</button>
	</form>
</dialog>
