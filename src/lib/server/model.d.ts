export interface GhUser {
	key: string;
	githubId: string;
	login: string;
}
export interface SummaryDay {
	userKey: string;
	date: string;
	posts: number;
	impressions: number;
}
export interface Summary {
	userKey: string;
	enabled: number;
	lastSummarizedOn: string | null;
	lastPostId: string | null;
	lastPostedAt: number | null;
	lastError: string | null;
}
export interface User {
	accessToken: string;
	refreshToken: string;
	key: string;
	socialId: string;
}
