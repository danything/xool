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
	// What x.com was actually billed for, as it happens. Cost used to be derived
	// from summaryDay, which only records days that were summarised -- a manual
	// or first-run post is neither, and cost money nobody could see.
	instance.run(`
		CREATE TABLE IF NOT EXISTS spend (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			userKey TEXT NOT NULL,
			at INTEGER NOT NULL,
			reads INTEGER NOT NULL,
			posts INTEGER NOT NULL,
			impressions INTEGER NOT NULL
		)
	`);
	instance.run("CREATE INDEX IF NOT EXISTS spend_at ON spend(at)");
	// Account lookups are billed at a different rate from post reads, so they
	// are counted separately rather than folded in.
	addColumn(instance, "spend", "userReads", "INTEGER NOT NULL DEFAULT 0");
	// Admin handed out from the admin page. ADMIN_X_IDS and ADMIN_GH_LOGINS stay
	// the root of it: those cannot be revoked from inside the app, so a mistake
	// here is always recoverable.
	instance.run(`
		CREATE TABLE IF NOT EXISTS admin (
			userKey TEXT PRIMARY KEY,
			grantedAt INTEGER NOT NULL,
			grantedBy TEXT NOT NULL
		)
	`);
	// Which posts have already been paid for today. x.com charges per resource
	// returned but deduplicates within a UTC day, so reading the same post a
	// second time before midnight is free -- and counting it again would put a
	// number on the admin page that the bill does not agree with.
	instance.run(`
		CREATE TABLE IF NOT EXISTS readCharge (
			day TEXT NOT NULL,
			postId TEXT NOT NULL,
			PRIMARY KEY (day, postId)
		)
	`);
	// x.com's own daily Post-read count, so the estimate can be checked against
	// the thing it is estimating rather than trusted.
	instance.run(`
		CREATE TABLE IF NOT EXISTS usageDay (
			day TEXT PRIMARY KEY,
			reads INTEGER NOT NULL
		)
	`);
	// The metrics page is gone, and LGTM now has its own repository, database
	// and deployment. These run on every boot because there is no migration
	// runner to run them once; each is a no-op on a database that has already
	// seen it.
	instance.run("DROP TABLE IF EXISTS tweetMetric");
	instance.run("DROP TABLE IF EXISTS tweet");
	instance.run("DROP TABLE IF EXISTS lImage");
	instance.run("DROP TABLE IF EXISTS ghUser");
	return instance;
}
