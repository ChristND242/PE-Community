#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "$1" >&2
  exit 1
}

: "${RELEASE_TAG:?RELEASE_TAG is required}"
: "${RELEASE_REF:?RELEASE_REF is required}"
: "${RELEASE_REF_TYPE:?RELEASE_REF_TYPE is required}"
: "${CHECKOUT_SHA:?CHECKOUT_SHA is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

[[ "$RELEASE_REF_TYPE" == "tag" ]] || fail "Automatic releases require a tag event."
[[ "$RELEASE_REF" == "refs/tags/$RELEASE_TAG" ]] || fail "Release tag context is inconsistent."
[[ "$RELEASE_TAG" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || \
  fail "Release tag must be strict stable semver (vMAJOR.MINOR.PATCH)."
[[ "$CHECKOUT_SHA" =~ ^[a-f0-9]{40}$ ]] || fail "GitHub checkout SHA is invalid."

tag_ref="refs/tags/$RELEASE_TAG"
if ! git fetch --force --no-tags origin "$tag_ref:$tag_ref"; then
  fail "Release tag ref could not be fetched."
fi

tag_type="$(git cat-file -t "$tag_ref" 2>/dev/null || true)"
[[ "$tag_type" == "tag" ]] || fail "Automatic releases require an annotated tag."

source_commit="$(git rev-parse "$tag_ref^{commit}" 2>/dev/null || true)"
[[ "$source_commit" =~ ^[a-f0-9]{40}$ ]] || fail "Release tag did not resolve to a commit."

checkout_commit="$(git rev-parse "$CHECKOUT_SHA^{commit}" 2>/dev/null || true)"
[[ "$checkout_commit" == "$source_commit" ]] || fail "Release tag and triggering checkout resolve to different commits."

main_ref="refs/remotes/origin/main"
if [[ -f "$(git rev-parse --git-path shallow)" ]]; then
  git fetch --no-tags --unshallow origin "+refs/heads/main:$main_ref"
else
  git fetch --no-tags origin "+refs/heads/main:$main_ref"
fi
git merge-base --is-ancestor "$source_commit" "$main_ref" || \
  fail "Release commit must belong to the protected main history."

echo "version=$RELEASE_TAG" >> "$GITHUB_OUTPUT"
echo "source_commit=$source_commit" >> "$GITHUB_OUTPUT"
echo "build_date=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_OUTPUT"
