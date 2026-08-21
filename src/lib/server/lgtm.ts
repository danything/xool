import { unlinkSync } from "node:fs";
import sharp from "sharp";
import { PER_PAGE } from "../paging";
import db from "./db";
import { generateUniqueKey } from "./key";

export async function create(files: File[], userKey: string) {
	const lgtmSource = await Bun.file("assets/lgtm.webp").arrayBuffer();
	for (const file of files) {
		const fileName = `${await generateUniqueKey((k) => Bun.file(`images/${k}.webp`).exists())}.webp`;
		const buffer = await sharp(await file.arrayBuffer(), { animated: true })
			.resize({
				width: 960,
				height: 960,
				fit: "inside",
			})
			.rotate()
			.webp({ quality: 80 })
			.toBuffer();
		const image = sharp(buffer);
		const metadata = await image.metadata();
		const lgtm = await sharp(lgtmSource)
			.resize({
				width: metadata.width,
				height: metadata.height,
				fit: "contain",
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			.toBuffer();

		await sharp(buffer, { animated: true })
			.composite([
				{
					input: lgtm,
					tile: true,
					top: 0,
					left: 0,
				},
			])
			.toFile(`images/${fileName}`);
		db().run(
			"INSERT INTO lImage (fileName, userKey, createdAt) VALUES (?, ?, ?)",
			[fileName, userKey, Date.now()],
		);
	}
}

export function deleteFile(fileName: string, userKey: string): boolean {
	const result = db().run(
		"DELETE FROM lImage WHERE fileName = ? AND userKey = ?",
		[fileName, userKey],
	);
	if (result.changes > 0) {
		unlinkSync(`images/${fileName}`);
	}
	return result.changes > 0;
}

/**
 * Removes every image a key owns, files included, and answers with how many.
 * The unlinks happen after the rows are gone: a file left on disk with no row
 * is invisible clutter, while a row pointing at a missing file is a gallery
 * tile that 404s.
 */
export function deleteAllImages(userKey: string): number {
	const rows = db()
		.query<{ fileName: string }, [string]>(
			"SELECT fileName FROM lImage WHERE userKey = ?",
		)
		.all(userKey);
	db().run("DELETE FROM lImage WHERE userKey = ?", [userKey]);
	for (const { fileName } of rows) {
		try {
			unlinkSync(`images/${fileName}`);
		} catch {
			// Already gone is the outcome we wanted.
		}
	}
	return rows.length;
}

export function get(page: number, find: boolean, userKey?: string) {
	const offset = (page - 1) * PER_PAGE;
	const rows = find
		? db()
				.query<{ fileName: string; userKey: string }, [string, number, number]>(
					"SELECT fileName, userKey FROM lImage WHERE userKey = ? ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?",
				)
				.all(userKey ?? "", PER_PAGE, offset)
		: db()
				.query<{ fileName: string; userKey: string }, [number, number]>(
					"SELECT fileName, userKey FROM lImage ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?",
				)
				.all(PER_PAGE, offset);

	return rows.map((image) => ({
		name: image.fileName,
		isDeletable: image.userKey === userKey,
	}));
}
