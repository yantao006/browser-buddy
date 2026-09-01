#!/usr/bin/env bash
# scripts/release.sh — package plugin + landing-screen zips, tag, and publish a GitHub Release.
#
# Usage:
#   scripts/release.sh --notes-file <path> [--dry-run] [--repo OWNER/NAME]
#   scripts/release.sh --notes <text>      [--dry-run] [--repo OWNER/NAME]
#
# Reads the plugin version from extensions/bb-similarweb-keywords/manifest.json.
# The Git tag is v<that version> (example: version 0.9.15 → tag v0.9.15).
# Does not bump the version and does not commit. Bump manifest.json on main first.
#
# Refuses when: not at repo root / not on the default branch / working tree dirty /
# HEAD is not origin/<default> / tag already exists / zip layout is wrong /
# gh-axi is missing / --notes and --notes-file are both missing (except --dry-run).
set -euo pipefail

usage() {
  awk 'NR==1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"
}

NOTES=""
NOTES_FILE=""
DRY_RUN=0
REPO_SLUG=""

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --notes)
      [ $# -ge 2 ] || { echo "error: --notes needs a value" >&2; exit 2; }
      NOTES=$2; shift 2 ;;
    --notes-file)
      [ $# -ge 2 ] || { echo "error: --notes-file needs a path" >&2; exit 2; }
      NOTES_FILE=$2; shift 2 ;;
    --repo)
      [ $# -ge 2 ] || { echo "error: --repo needs OWNER/NAME" >&2; exit 2; }
      REPO_SLUG=$2; shift 2 ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2 ;;
  esac
done

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

if [ "$(pwd -P)" != "$(git rev-parse --show-toplevel)" ]; then
  echo "error: run this script from the browser-buddy repository root" >&2
  exit 1
fi

MANIFEST=extensions/bb-similarweb-keywords/manifest.json
SCREEN_DIR=tools/landing-screen
[ -f "$MANIFEST" ] || { echo "error: missing $MANIFEST" >&2; exit 1; }
[ -d "$SCREEN_DIR" ] || { echo "error: missing $SCREEN_DIR" >&2; exit 1; }

VERSION=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$MANIFEST")
case "$VERSION" in
  [0-9]*.[0-9]*) ;;
  *) echo "error: unexpected manifest version: $VERSION" >&2; exit 1 ;;
esac
TAG=v$VERSION
PLUGIN_ZIP=bb-similarweb-keywords-$VERSION.zip
SCREEN_ZIP=landing-screen-$VERSION.zip

DEFAULT_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
DEFAULT_BRANCH=${DEFAULT_BRANCH:-main}
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "$DEFAULT_BRANCH" ]; then
  echo "error: on $CURRENT_BRANCH, not $DEFAULT_BRANCH" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree is dirty; commit or stash first" >&2
  git status --porcelain >&2
  exit 1
fi

git fetch origin "$DEFAULT_BRANCH" >/dev/null
HEAD=$(git rev-parse HEAD)
ORIGIN=$(git rev-parse "origin/$DEFAULT_BRANCH")
if [ "$HEAD" != "$ORIGIN" ]; then
  echo "error: HEAD $HEAD is not origin/$DEFAULT_BRANCH $ORIGIN" >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "error: local tag $TAG already exists" >&2
  exit 1
fi
if git ls-remote --tags origin "refs/tags/$TAG" | grep -q .; then
  echo "error: origin already has $TAG" >&2
  exit 1
fi

if [ -z "$NOTES" ] && [ -z "$NOTES_FILE" ] && [ "$DRY_RUN" -eq 0 ]; then
  echo "error: pass --notes or --notes-file (required except --dry-run)" >&2
  exit 2
fi
if [ -n "$NOTES" ] && [ -n "$NOTES_FILE" ]; then
  echo "error: use only one of --notes or --notes-file" >&2
  exit 2
fi
if [ -n "$NOTES_FILE" ] && [ ! -f "$NOTES_FILE" ]; then
  echo "error: notes file not found: $NOTES_FILE" >&2
  exit 1
fi

if [ -z "$REPO_SLUG" ]; then
  ORIGIN_URL=$(git remote get-url origin)
  REPO_SLUG=$(printf '%s\n' "$ORIGIN_URL" | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
fi
case "$REPO_SLUG" in
  */*) ;;
  *) echo "error: could not parse OWNER/NAME from origin ($ORIGIN_URL)" >&2; exit 1 ;;
esac

command -v gh-axi >/dev/null || { echo "error: gh-axi is required" >&2; exit 1; }
command -v zip >/dev/null || { echo "error: zip is required" >&2; exit 1; }

STAGE=$(mktemp -d "${TMPDIR:-/tmp}/bb-release.XXXXXX")
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

mkdir -p "$STAGE/bb-similarweb-keywords" "$STAGE/landing-screen"
rsync -a --exclude '.DS_Store' --exclude '.git' \
  "extensions/bb-similarweb-keywords/" "$STAGE/bb-similarweb-keywords/"
rsync -a --exclude '.DS_Store' --exclude '.git' --exclude '__pycache__' --exclude '*.pyc' \
  "$SCREEN_DIR/" "$STAGE/landing-screen/"

( cd "$STAGE" && zip -qr "$STAGE/$PLUGIN_ZIP" bb-similarweb-keywords )
( cd "$STAGE" && zip -qr "$STAGE/$SCREEN_ZIP" landing-screen )

plugin_top=$(unzip -Z1 "$STAGE/$PLUGIN_ZIP" | awk -F/ 'NR==1{print $1; exit}')
if [ "$plugin_top" != "bb-similarweb-keywords" ]; then
  echo "error: plugin zip top-level is $plugin_top, expected bb-similarweb-keywords/" >&2
  exit 1
fi
unzip -l "$STAGE/$PLUGIN_ZIP" | grep -q 'bb-similarweb-keywords/manifest.json' \
  || { echo "error: plugin zip missing bb-similarweb-keywords/manifest.json" >&2; exit 1; }
unzip -l "$STAGE/$SCREEN_ZIP" | grep -q 'landing-screen/screen.py' \
  || { echo "error: landing-screen zip missing landing-screen/screen.py" >&2; exit 1; }

echo "version: $VERSION"
echo "tag:     $TAG"
echo "commit:  $HEAD"
echo "repo:    $REPO_SLUG"
echo "plugin:  $PLUGIN_ZIP"
echo "screen:  $SCREEN_ZIP"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "dry-run: not tagging, not pushing, not creating a GitHub release"
  unzip -l "$STAGE/$PLUGIN_ZIP" | head -20
  unzip -l "$STAGE/$SCREEN_ZIP" | head -20
  exit 0
fi

git tag -a "$TAG" -m "$TAG"
if ! git push origin "$TAG"; then
  git tag -d "$TAG" >/dev/null 2>&1 || true
  echo "error: failed to push $TAG; local tag removed" >&2
  exit 1
fi

create_args=(release create "$TAG" -R "$REPO_SLUG" --title "$TAG" --verify-tag)
if [ -n "$NOTES_FILE" ]; then
  create_args+=(--notes-file "$NOTES_FILE")
else
  create_args+=(--notes "$NOTES")
fi
create_args+=("$STAGE/$PLUGIN_ZIP" "$STAGE/$SCREEN_ZIP")

if ! gh-axi "${create_args[@]}"; then
  echo "error: gh-axi release create failed. Tag $TAG is on origin; upload zips with:" >&2
  echo "  gh-axi release upload $TAG $PLUGIN_ZIP $SCREEN_ZIP -R $REPO_SLUG" >&2
  exit 1
fi

# create may succeed before assets attach; upload is idempotent-enough to repair
if ! gh-axi release upload "$TAG" "$STAGE/$PLUGIN_ZIP" "$STAGE/$SCREEN_ZIP" -R "$REPO_SLUG"; then
  echo "warning: release exists; if zips are already attached this warning is harmless" >&2
fi

echo "published: https://github.com/$REPO_SLUG/releases/tag/$TAG"
