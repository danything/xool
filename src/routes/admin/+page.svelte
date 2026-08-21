<script lang="ts">
import { invalidateAll } from "$app/navigation";
import { setMessage } from "$lib/stores/toast.svelte";
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

let saving = $state<string>();
// Deleting an account cannot be undone, so the first click only arms the
// button; any other click puts it back.
let armed = $state<string>();

$effect(() => {
	if (armed === undefined) return;
	const disarm = () => {
		armed = undefined;
	};
	window.addEventListener("click", disarm);
	return () => window.removeEventListener("click", disarm);
});

async function remove(event: MouseEvent, user: { userKey: string }) {
	event.stopPropagation();
	if (armed !== user.userKey) {
		armed = user.userKey;
		return;
	}
	armed = undefined;
	try {
		saving = user.userKey;
		const res = await fetch("/api/admin", {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ userKey: user.userKey }),
		});
		const ret = await res.json();
		if (!res.ok || ret.error)
			throw new Error(ret.error ?? "削除できませんでした");
		setMessage("削除しました");
	} catch (error) {
		setMessage(error instanceof Error ? error.message : "削除できませんでした");
	} finally {
		await invalidateAll();
		saving = undefined;
	}
}

async function setAdmin(userKey: string, admin: boolean) {
	try {
		saving = userKey;
		const res = await fetch("/api/admin", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ userKey, admin }),
		});
		const ret = await res.json();
		if (!res.ok || ret.error)
			throw new Error(ret.error ?? "変更できませんでした");
		setMessage(admin ? "管理者にしました" : "管理者を解除しました");
	} catch (error) {
		setMessage(error instanceof Error ? error.message : "変更できませんでした");
	} finally {
		await invalidateAll();
		saving = undefined;
	}
}

const number = new Intl.NumberFormat("ja-JP");
const money = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 3,
});
// JST explicitly, so the server's UTC render and the browser's do not disagree
// and swap on hydration. The daily rows beside it are JST too.
const dateTime = new Intl.DateTimeFormat("ja-JP", {
	dateStyle: "short",
	timeStyle: "short",
	timeZone: "Asia/Tokyo",
});
</script>

<div class="page-container p-4">
	<div class="stats stats-vertical sm:stats-horizontal mb-4">
		<div class="stat">
			<div class="stat-title">ログイン済みユーザー</div>
			<div class="stat-value">{number.format(data.summary.users)}</div>
		</div>
		<div class="stat">
			<div class="stat-title">自動ポストON</div>
			<div class="stat-value">{number.format(data.summary.enabled)}</div>
		</div>
		<div class="stat">
			<div class="stat-title">𝕏への支払い (直近30日・推定)</div>
			<div class="stat-value">{money.format(data.summary.cost)}</div>
		</div>
	</div>

	{#if data.summary.failing.length > 0}
		<div class="prose"><h4>失敗しているユーザー</h4></div>
		<div class="overflow-x-auto">
			<table class="table table-sm">
				<thead>
					<tr>
						<th scope="col">𝕏 ID</th>
						<th scope="col">最終処理</th>
						<th scope="col">内容</th>
					</tr>
				</thead>
				<tbody>
					{#each data.summary.failing as row (row.socialId)}
						<tr>
							<td>{row.socialId}</td>
							<td>{row.lastSummarizedOn ?? "-"}</td>
							<td>{row.error}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<div class="prose"><h4>日別 (直近30日)</h4></div>
	<div class="overflow-x-auto">
		<table class="table table-sm">
			<thead>
				<tr>
					<th scope="col">日付</th>
					<th scope="col">対象</th>
					<th scope="col">読み取り</th>
					<th scope="col">アカウント参照</th>
					<th scope="col">投稿</th>
					<th scope="col">インプレッション</th>
					<th scope="col">費用</th>
				</tr>
			</thead>
			<tbody>
				{#each data.summary.days as day (day.date)}
					<tr>
						<td>{day.date}</td>
						<td>{number.format(day.users)}</td>
						<td>{number.format(day.posts)}</td>
						<td>{number.format(day.userReads)}</td>
						<td>{number.format(day.posted)}</td>
						<td>{number.format(day.impressions)}</td>
						<td>{money.format(day.cost)}</td>
					</tr>
				{:else}
					<tr><td colspan="7">まだ記録がありません</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="prose"><h4>ユーザーと権限</h4></div>
	<div class="overflow-x-auto">
		<table class="table table-sm">
			<thead>
				<tr>
					<th scope="col">𝕏 ID</th>
					<th scope="col">key</th>
					<th scope="col">管理者</th>
					<th scope="col"></th>
				</tr>
			</thead>
			<tbody>
				{#each data.users as user (user.userKey)}
					<tr>
						<td>{user.socialId}</td>
						<td class="font-mono opacity-60">{user.userKey.slice(0, 8)}…</td>
						<td>
							{#if user.fixed}
								<!-- Named in the environment, so the app has no say in it. -->
								<span class="badge badge-ghost badge-sm">環境変数</span>
							{:else}
								<button
									type="button"
									class={`btn btn-xs ${user.admin ? "btn-error" : ""}`}
									disabled={saving !== undefined}
									onclick={() => setAdmin(user.userKey, !user.admin)}
								>
									{#if saving === user.userKey}
										<span class="loading loading-spinner loading-xs"></span>
									{/if}
									{user.admin ? "解除" : "付与"}
								</button>
							{/if}
						</td>
						<td>
							{#if !user.fixed}
								<button
									type="button"
									class={`btn btn-xs ${armed === user.userKey ? "btn-error" : "btn-ghost"}`}
									disabled={saving !== undefined}
									onclick={(event) => remove(event, user)}
								>
									{#if saving === user.userKey}
										<span class="loading loading-spinner loading-xs"></span>
									{/if}
									{armed === user.userKey ? "本当に削除" : "削除"}
								</button>
							{/if}
						</td>
					</tr>
				{:else}
					<tr><td colspan="4">まだユーザーがいません</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
