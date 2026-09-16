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
		lastPostedAt?: number;
		lastError?: string;
	};
	keyInfo?: {
		status?: number;
		error?: string;
		data?: { id?: string | number; name?: string; username?: string };
	};
};

let { message, wkey, summary, keyInfo }: Props = $props();

let saving = $state(false);
let postingNow = $state(false);

// 認証済みかどうか。認証前は何をするものかを見せる側に倒す
const signedIn = $derived(wkey !== undefined && keyInfo !== undefined);

// Pinned rather than left to the runtime: the server renders this in the
// container's UTC and the browser would re-render it nine hours later on
// hydration, so the time visibly jumps the moment the page opens. JST is also
// the right answer -- the whole feature is defined against JST midnight.
const dateTime = new Intl.DateTimeFormat("ja-JP", {
	dateStyle: "short",
	timeStyle: "short",
	timeZone: "Asia/Tokyo",
});

/**
 * 認証前に見せる見本。**架空の数字**で、行の並びは実際に投稿するものと同じ
 * (summary.ts の組み立てに合わせてある)。繋ぐ前に何が流れるか分かるようにするため。
 */
const SAMPLE = [
	"9月15日のポスト: 4件 (前日比 +1)",
	"うちリプライ 1件",
	"いいね 128・リポスト 12・返信 8・ブックマーク 3",
	"インプレッション 12,400 (平均 3,100・最高 6,800)",
	"プロフィールクリック 24・リンククリック 9",
	"5日連続でポスト中",
	"",
	"#ポスト通信簿",
].join("\n");

/** 通信簿に出る指標。色は意味で決める(反応=桃、伸び=青、行動=緑) */
const METRICS = [
	{ label: "いいね", tone: "pink" },
	{ label: "リポスト", tone: "green" },
	{ label: "返信", tone: "blue" },
	{ label: "ブックマーク", tone: "amber" },
	{ label: "インプレッション", tone: "violet" },
	{ label: "プロフィール・リンククリック", tone: "teal" },
] as const;

async function postNow() {
	try {
		postingNow = true;
		const res = await fetch("/api/summary/now", { method: "POST" });
		const ret = await res.json();
		if (!res.ok || ret.error)
			throw new Error(ret.error ?? "投稿できませんでした");
		setMessage(
			ret.posted ? "現在までの分を投稿しました" : "投稿できませんでした",
		);
	} catch (error) {
		setMessage(error instanceof Error ? error.message : "投稿できませんでした");
	} finally {
		await invalidateAll();
		postingNow = false;
	}
}

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

<div class="page wrap">
	{#if message !== undefined}
		<ErrorAlert>{message}</ErrorAlert>
		<SignInButton />
	{:else if signedIn}
		<!-- ========== 認証済み ========== -->
		<section class="panel body main">
			<div class="cluster">
				<h2>自動ポスト</h2>
				<span class="tag {summary?.enabled ? 'on' : ''}">
					{summary?.enabled ? "ON" : "OFF"}
				</span>
			</div>
			<label class="check">
				<input
					type="checkbox"
					role="switch"
					checked={summary?.enabled}
					disabled={saving}
					onchange={toggleSummary}
				/>
				<span>毎日 0:00 (JST) に前日のポストをまとめて自動ポストする</span>
			</label>
			<p class="small muted">
				初めてONにしたときは、その時点までの当日分をすぐ投稿します。
				<br />
				自動ポストはポストが0件の日をスキップします (今すぐ投稿は0件でも投稿します)。リポストは数に含めません。
				{#if summary?.lastPostedAt}
					<br />
					最終投稿: {dateTime.format(summary.lastPostedAt)}
				{/if}
			</p>
			{#if summary?.enabled}
				<!-- The automatic first post only happens once, so without this there
				     is no way to see one again before midnight. -->
				<div>
					<button
						type="button"
						class="mini plain"
						disabled={postingNow}
						onclick={postNow}
					>
						{#if postingNow}
							<span class="spin"></span>
						{/if}
						今すぐ投稿
					</button>
				</div>
			{/if}
			{#if summary?.lastError}
				<ErrorAlert>前回の自動ポスト: {summary.lastError}</ErrorAlert>
			{/if}
		</section>

		{@const ret = keyInfo}
		<section class="panel body">
			{#if ret?.error}
				<ErrorAlert>{ret.error}</ErrorAlert>
			{:else}
				<h2>現在のアカウント</h2>
				{#if ret?.status === 429}
					<div role="alert" class="note warn">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
					<div class="who">
						<!--
							slice(0,1) だと UTF-16 の単位で切るので、絵文字始まりの表示名
							(𝕏 では珍しくない)が壊れる。コードポイントで取る
						-->
						<span class="av" aria-hidden="true">
							{[...(ret?.data?.name ?? "?")][0]}
						</span>
						<div>
							<div class="name">{ret?.data?.name}</div>
							<div class="small muted">@{ret?.data?.username} ・ ID {ret?.data?.id}</div>
						</div>
					</div>
				{/if}
				<p class="small muted">
					別のアカウントを使用する場合は下記で認証画面内でアカウント選択できます
				</p>
			{/if}
			<div><SignInButton /></div>
		</section>
	{:else}
		<!-- ========== 認証前 ========== -->
		<section class="hero">
			<div class="pitch">
				<span class="eyebrow">毎日 0:00 (JST) に自動ポスト</span>
				<h1>ポスト通信簿</h1>
				<p class="lead muted">
					前日のポストの反応と伸びをまとめて、あなたのアカウントから1件だけポストします。
					自分の積み上げが毎朝1行で残ります。
				</p>
				<SignInButton />
				<!--
					𝕏 が 2026 年 9 月から、従量課金のアプリで書き込み権限を求めると
					同意画面に黄色い枠を出すようになった。開発者側で消す手段が無く、
					チェックを入れないと認可ボタンが押せないので、先に知らせておく
				-->
				<div class="note info">
					<div>
						<strong>𝕏 の認証画面に「Sensitive permissions requested」と出ます。</strong>
						<p class="small">
							自動ポストのために書き込み権限を求めるアプリすべてに 𝕏 が出す確認です。
							<strong>「I trust this app」にチェックを入れる</strong>と認可ボタンが押せるようになります。
						</p>
					</div>
				</div>
				<p class="small muted">
					保存するのは User ID と 𝕏 のトークンだけです。ポストの中身も、あなたのほかの情報も保存しません。
				</p>
			</div>

			<!-- 繋ぐ前に成果物を見せる。行の並びは実際の投稿と同じ -->
			<figure class="sample panel">
				<figcaption>
					<span class="av" aria-hidden="true">𝕏</span>
					こんなポストが流れます
					<span class="tag">サンプル</span>
				</figcaption>
				<pre>{SAMPLE}</pre>
			</figure>
		</section>

		<section class="metrics">
			<h2>通信簿に出るもの</h2>
			<ul>
				{#each METRICS as m (m.label)}
					<li class="tone-{m.tone}"><span class="dot" aria-hidden="true"></span>{m.label}</li>
				{/each}
			</ul>
			<p class="small muted">
				前日比と連続ポスト日数も付きます。数字が0の行と、ポストが無かった日は出しません(1件 $0.015 かかるため)。
			</p>
		</section>
	{/if}

	<section class="panel body">
		<h2>運営費について</h2>
		<p>
			𝕏のAPIが従量課金のため、自動ポスト1件につき <strong>$0.015</strong>、集計の読み取りに1ポストあたり
			<strong>$0.005</strong> かかり、運営者が負担しています。支えていただける方は
			<a target="_blank" href="https://ko-fi.com/yui5m" rel="noreferrer"> Ko-fi </a>
			へ。
		</p>
	</section>

	<section class="panel body">
		<h2>プライバシー</h2>
		<p>
			サーバに保存するのはUser ID・Access Token・Refresh
			Tokenのみで、そのほかのユーザー情報は一切取得していません。
		</p>
	</section>

	<p class="small muted foot">
		不具合の報告は
		<a target="_blank" href="https://x.com/5yuim" rel="noreferrer"> @5yuim </a>
		へ ・
		<a target="_blank" href="https://github.com/danything/xool" rel="noreferrer">
			ソースコード
		</a>
	</p>
</div>

<style>
.wrap {
	display: flex;
	flex-direction: column;
	gap: 1.25rem;
	padding-block: 1rem 2.5rem;
}
h2 {
	font-size: 1.15rem;
}
p {
	margin: 0;
}

/* ---- 認証前 ---- */
.hero {
	display: grid;
	align-items: start;
	gap: 1.5rem;
}
@media (width >= 56rem) {
	.hero {
		grid-template-columns: minmax(0, 1fr) minmax(0, 22rem);
		gap: 2rem;
	}
}
.pitch {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 0.9rem;
}
.eyebrow {
	border-radius: 999px;
	background: var(--ui-tint);
	padding: 0.25rem 0.75rem;
	color: var(--pico-primary);
	font-size: 0.78rem;
	font-weight: 700;
}
.pitch h1 {
	margin: 0;
	font-size: clamp(1.9rem, 6vw, 2.5rem);
	letter-spacing: -0.02em;
	line-height: 1.25;
}
.lead {
	font-size: 1.05rem;
}
.note p {
	margin-top: 0.3rem;
}

/* 見本。𝕏 の投稿に見えるよう、上に名前の帯を付ける */
.sample {
	margin: 0;
	overflow: hidden;
}
.sample figcaption {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5rem;
	border-bottom: 1px solid var(--ui-base-300);
	background: var(--ui-base-200);
	padding: 0.5rem 0.75rem;
	color: var(--ui-muted);
	font-size: 0.85rem;
	font-weight: 700;
}
.sample .tag {
	margin-left: auto;
}
.sample pre {
	margin: 0;
	background: var(--ui-surface);
	padding: 1rem;
	font-size: 0.85rem;
	line-height: 1.9;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
/* 𝕏 の丸。ここだけ 𝕏 の黒 */
.av {
	display: grid;
	width: 1.75rem;
	height: 1.75rem;
	flex: none;
	place-items: center;
	border-radius: 999px;
	background: #000;
	color: #fff;
	font-size: 0.9rem;
	font-weight: 700;
}

/* 出る指標。**ここが画面で唯一の色**なので、意味ごとに変える */
.metrics ul {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	margin: 0.75rem 0;
	padding: 0;
	list-style: none;
}
.metrics li {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	border: 1px solid var(--ui-base-300);
	border-radius: 999px;
	background: var(--ui-surface);
	padding: 0.2rem 0.75rem;
	font-size: 0.85rem;
	font-weight: 700;
}
.dot {
	width: 0.6rem;
	height: 0.6rem;
	border-radius: 999px;
	background: currentColor;
}
.tone-pink {
	color: #d6336c;
}
.tone-green {
	color: #2f9e44;
}
.tone-blue {
	color: #1c7ed6;
}
.tone-amber {
	color: #b8860b;
}
.tone-violet {
	color: #7048e8;
}
.tone-teal {
	color: #0c8599;
}

/* ---- 認証済み ---- */
/* 入切がこの画面の主役なので、枠を主色にして最初に目が行くようにする */
.main {
	border-color: var(--pico-primary);
}
.main .check {
	gap: 0.75rem;
	font-size: 1rem;
}
.tag.on {
	border-color: transparent;
	background: var(--ui-ok);
	color: var(--pico-primary-inverse);
}
.who {
	display: flex;
	align-items: center;
	gap: 0.6rem;
}
.who .av {
	width: 2.5rem;
	height: 2.5rem;
	background: var(--pico-primary);
	font-size: 1.1rem;
}
.name {
	font-weight: 700;
}

/* 線画のアイコン。色は文字と揃える */
svg {
	flex-shrink: 0;
	width: 1.5rem;
	height: 1.5rem;
	stroke: currentColor;
}
.foot {
	margin-top: 0.25rem;
}
</style>
