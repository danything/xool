#!/bin/sh
set -eu

# A rollout runs two pods at once, and the hashed asset filenames change with
# every build. Whichever pod answers a request has to be able to serve the
# chunks the other one's HTML asked for, or the page never gets its JavaScript.
#
# So the served asset directory is a volume shared by both pods, and every
# build merges its own files into it on the way up. Filenames are content
# hashes, so builds accumulate side by side and never collide.
SHARED=/usr/src/app/build/client/_app/immutable
SOURCE=/usr/src/app/immutable-src

mkdir -p "$SHARED"
# -n keeps whatever is already there: identical hashes mean identical bytes,
# and a file another pod is serving right now must not be rewritten underneath
# it. A failure here is fatal on purpose -- a pod with no assets should never
# pass its readiness probe and take over from one that works.
cp -Rn "$SOURCE"/. "$SHARED"/

# Builds from before the last 30 days are dropped, except anything this build
# still needs: a chunk that has not changed in a month is still being served.
find "$SHARED" -type f -mtime +30 | while read -r file; do
	case "$SOURCE/${file#"$SHARED/"}" in
		*) [ -e "$SOURCE/${file#"$SHARED/"}" ] || rm -f "$file" ;;
	esac
done

exec bun "$@"
