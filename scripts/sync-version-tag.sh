#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Run this script inside a git repository."
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

BUMP_TYPE="${1:-}"
if [[ -z "$BUMP_TYPE" ]]; then
  echo "Usage: ./scripts/sync-version-tag.sh <major|minor|patch|premajor|preminor|prepatch|prerelease>"
  exit 1
fi

case "$BUMP_TYPE" in
  major|minor|patch|premajor|preminor|prepatch|prerelease) ;;
  *)
    echo "Invalid bump type: $BUMP_TYPE"
    echo "Allowed values: major, minor, patch, premajor, preminor, prepatch, prerelease"
    exit 1
    ;;
esac

npm version "$BUMP_TYPE" --no-git-tag-version >/dev/null

VERSION="$(node -p "require('./package.json').version")"
TAG="v$VERSION"

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Tag $TAG already exists. Choose another version."
  exit 1
fi

FILES_TO_ADD=("package.json")
if [[ -f "package-lock.json" ]]; then
  FILES_TO_ADD+=("package-lock.json")
fi

git add "${FILES_TO_ADD[@]}"

if git diff --cached --quiet; then
  echo "No version changes to commit."
  exit 1
fi

git commit -m "chore(release): $TAG"
git tag -a "$TAG" -m "Release $TAG"

echo "Release version synced:"
echo "- package version: $VERSION"
echo "- git tag: $TAG"
echo
echo "Push with:"
echo "git push origin HEAD --follow-tags"
