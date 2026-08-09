import type { Database as DatabaseType } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

let instance: DatabaseType | undefined;

/** ALTER TABLE ADD COLUMN, minus the error when it is already there. */
function addColumn(
	database: DatabaseType,
	table: string,
	column: string,
	definition: string,
) {
	const columns = database
		.query<{ name: string }, []>(`PRAGMA table_info(${table})`)
		.all();
	if (columns.some((existing) => existing.name === column)) return;
	database.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export default function db(): DatabaseType {
	if (instance) return instance;
	const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
	const path = process.env.DB_PATH ?? "data/xool.db";
	mkdirSync(dirname(path), { recursive: true });
	instance = new Database(path);
	instance.exec("PRAGMA journal_mode = WAL;");
	// During a rolling update the outgoing and incoming pod share this file for
	// a few seconds. WAL lets them read concurrently; this makes the one writer
	// at a time wait its turn instead of failing with SQLITE_BUSY.
	instance.exec("PRAGMA busy_timeout = 5000;");
	instance.run(`
		CREATE TABLE IF NOT EXISTS user (
			key TEXT PRIMARY KEY,
			socialId TEXT NOT NULL UNIQUE,
			accessToken TEXT NOT NULL,
			refreshToken TEXT NOT NULL
		)
	`);
	// LGTM's own sign-in. No token is kept: it is only ever used once, during
	// the callback, to ask GitHub who just arrived.
	instance.run(`
		CREATE TABLE IF NOT EXISTS ghUser (
			key TEXT PRIMARY KEY,
			githubId TEXT NOT NULL UNIQUE,
			login TEXT NOT NULL
		)
	`);
	instance.run(`
		CREATE TABLE IF NOT EXISTS lImage (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			fileName TEXT NOT NULL UNIQUE,
			userKey TEXT NOT NULL,
			createdAt INTEGER NOT NULL
		)
	`);
	instance.run("CREATE INDEX IF NOT EXISTS lImage_userKey ON lImage(userKey)");
	instance.run(`
		CREATE TABLE IF NOT EXISTS summary (
			userKey TEXT PRIMARY KEY,
			enabled INTEGER NOT NULL,
			lastSummarizedOn TEXT,
			lastPostId TEXT,
			lastError TEXT
		)
	`);
	// One row per day already summarised. x.com is never asked for any of this
	// twice, so comparing a day with the one before it, or counting a streak,
	// costs nothing.
	instance.run(`
		CREATE TABLE IF NOT EXISTS summaryDay (
			userKey TEXT NOT NULL,
			date TEXT NOT NULL,
			posts INTEGER NOT NULL,
			impressions INTEGER NOT NULL,
			PRIMARY KEY (userKey, date)
		)
	`);
	// Whether a summary went out for that day, which is what x.com charges the
	// $0.015 for. Added after the table shipped, so it has to be checked for.
	addColumn(instance, "summaryDay", "posted", "INTEGER NOT NULL DEFAULT 0");
	// When the last summary actually went out. lastSummarizedOn is bookkeeping
	// about which day has been dealt with, which is not the same question and
	// made a poor thing to show someone.
	addColumn(instance, "summary", "lastPostedAt", "INTEGER");
	// The metrics page is gone and so are the tables it filled. This runs on
	// every boot because there is no migration runner to run it once; both
	// statements are no-ops on a database that has already seen them.
	instance.run("DROP TABLE IF EXISTS tweetMetric");
	instance.run("DROP TABLE IF EXISTS tweet");
	return instance;
}
