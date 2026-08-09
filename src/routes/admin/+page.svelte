<script lang="ts">
import type { PageProps } from "./$types";

let { data }: PageProps = $props();

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
	{#if data.site === "xool"}
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
	{:else}
		<div class="stats stats-vertical sm:stats-horizontal mb-4">
			<div class="stat">
				<div class="stat-title">画像</div>
				<div class="stat-value">{number.format(data.lgtm.images)}</div>
			</div>
			<div class="stat">
				<div class="stat-title">アップロードした人</div>
				<div class="stat-value">{number.format(data.lgtm.owners)}</div>
			</div>
			<div class="stat">
				<div class="stat-title">GitHub連携済み</div>
				<div class="stat-value">{number.format(data.lgtm.githubUsers)}</div>
			</div>
		</div>

		<div class="prose"><h4>ユーザー別</h4></div>
		<div class="overflow-x-auto">
			<table class="table table-sm">
				<thead>
					<tr>
						<th scope="col">GitHub</th>
						<th scope="col">𝕏 ID</th>
						<th scope="col">key</th>
						<th scope="col">画像</th>
						<th scope="col">最終</th>
					</tr>
				</thead>
				<tbody>
					{#each data.lgtm.uploaders as row (row.userKey)}
						<tr>
							<td>{row.login ?? "-"}</td>
							<td>{row.socialId ?? "-"}</td>
							<td class="font-mono opacity-60">{row.userKey}…</td>
							<td>{number.format(row.images)}</td>
							<td>{dateTime.format(row.latest)}</td>
						</tr>
					{:else}
						<tr><td colspan="5">まだ画像がありません</td></tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="prose"><h4>日別 (直近30日)</h4></div>
		<div class="overflow-x-auto">
			<table class="table table-sm">
				<thead>
					<tr>
						<th scope="col">日付</th>
						<th scope="col">画像</th>
					</tr>
				</thead>
				<tbody>
					{#each data.lgtm.days as day (day.date)}
						<tr>
							<td>{day.date}</td>
							<td>{number.format(day.images)}</td>
						</tr>
					{:else}
						<tr><td colspan="2">まだ画像がありません</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
