<script lang="ts">
import { invalidateAll } from "$app/navigation";
import ErrorAlert from "$lib/components/ErrorAlert.svelte";
import SignInButton from "$lib/components/SignInButton.svelte";
import { setMessage } from "$lib/stores/toast.svelte";

type Props = {
	message?: string;
	wkey?: string;
	summary?: {
		enabled: boolean;
		lastSummarizedOn?: string;
		lastError?: string;
	};
	keyInfo?: Promise<{
		status?: number;
		error?: string;
		data?: { id?: string | number; name?: string; username?: string };
	}>;
};

let { message, wkey, summary, keyInfo }: Props = $props();

let saving = $state(false);

async function toggleSummary(event: Event) {
	const enabled = (event.currentTarget as HTMLInputElement).checked;
	try {
		saving = true;
		const res = await fetch("/api/summary", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ enabled }),
		});
		const ret = await res.json();
		if (!res.ok || ret.error)
			throw new Error(ret.error ?? "設定を保存できませんでした");
		setMessage(
			!enabled
				? "自動ポストをOFFにしました"
				: ret.posted
					? "現在までの分を投稿しました"
					: "ONにしました (次回の0:00から投稿します)",
		);
	} catch (error) {
		setMessage(
			error instanceof Error ? error.message : "設定を保存できませんでした",
		);
	} finally {
		await invalidateAll();
		saving = false;
	}
}
</script>

<div class="mx-auto p-4 prose">
	<p>
		前日のポストの成績を毎日0:00にまとめて自動ポストする、ポスト通信簿です
	</p>
	{#if message !== undefined}
		<ErrorAlert>{message}</ErrorAlert>
	{:else if wkey !== undefined && keyInfo}
		<label class="flex items-center gap-3 not-prose">
			<input
				type="checkbox"
				class="toggle toggle-primary"
				checked={summary?.enabled}
				disabled={saving}
				onchange={toggleSummary}
			/>
			<span>毎日 0:00 (JST) に前日のポストをまとめて自動ポストする</span>
		</label>
		<p class="text-sm opacity-60">
			初めてONにしたときは、その時点までの当日分をすぐ投稿します。
			<br />
			ポストが1件もなかった日は投稿しません。リポストは数に含めません。
			{#if summary?.lastSummarizedOn}
				<br />
				最終処理: {summary.lastSummarizedOn} 分
			{/if}
		</p>
		{#if summary?.lastError}
			<ErrorAlert>前回の自動ポスト: {summary.lastError}</ErrorAlert>
		{/if}
		{#await keyInfo}
			<div class="skeleton h-8 w-full mt-8 mb-3"></div>
			<div class="skeleton h-24 w-full mt-7 mb-7"></div>
			<div class="skeleton h-8 w-full mt-8 mb-3"></div>
		{:then ret}
			{#if ret?.error}
				<ErrorAlert>{ret.error}</ErrorAlert>
			{:else}
				<h3 class="mb-2">現在のアカウント</h3>
				{#if ret?.status === 429}
					<div role="alert" class="alert alert-warning">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
						>
							<title>Warning</title>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
						<span>ユーザー情報取得APIが上限に達しました</span>
					</div>
				{:else}
					<div class="overflow-x-auto not-prose">
						<table class="table text-base">
							<thead>
								<tr>
									<th scope="col">ID</th>
									<th scope="col">Name</th>
									<th scope="col">Username</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td>{ret?.data?.id}</td>
									<td>{ret?.data?.name}</td>
									<td>{ret?.data?.username}</td>
								</tr>
							</tbody>
						</table>
					</div>
				{/if}
				<p class="text-sm opacity-60 mt-2">
					別のアカウントを使用する場合は下記で認証画面内でアカウント選択できます
				</p>
			{/if}
		{:catch error}
			<!-- Without this branch Svelte leaves the skeleton above on screen when
			     the promise rejects, so a failed lookup looks like one still
			     loading and never resolves. -->
			<ErrorAlert>
				アカウント情報を取得できませんでした: {error.message}
			</ErrorAlert>
		{/await}
	{/if}
	<SignInButton />
	<h3>運営費について</h3>
	<p>
		𝕏はAPIを従量課金にしたため、ポスト1件ごとに費用がかかります。
		<br />
		サマリーの自動ポストは1日1件で <strong>$0.015</strong>、集計のための読み取りが
		1ポストあたり <strong>$0.001</strong> で、これは運営者が負担しています。
	</p>
	<p>
		支えていただける方は
		<a
			class="link link-primary"
			target="_blank"
			href="https://ko-fi.com/yui5m"
			rel="noreferrer"
		>
			Ko-fi
		</a>
		からお願いします。
	</p>
	<h3>プライバシー</h3>
	<p>
		𝕏との連携にあたってUser ID, Access Token, Refresh
		Tokenのみをサーバに保存しております。
		<br />
		そのほかのユーザー情報の取得は一切行っておりませんので、ご安心ください。
	</p>
	<p>
		不具合などの報告は
		<a
			class="link link-primary"
			target="_blank"
			href="https://x.com/5yuim"
			rel="noreferrer"
		>
			@5yuim
		</a>
		へ
	</p>
	<a
		class="link link-primary"
		target="_blank"
		href="https://github.com/DAnything/xool"
		rel="noreferrer"
	>
		ソースコード
	</a>
</div>
