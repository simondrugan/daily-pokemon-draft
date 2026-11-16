#!/usr/bin/env bash
# Creates or updates the single preview comment on a pull request.
# Used by .github/workflows/deploy.yml; needs GH_TOKEN and GITHUB_REPOSITORY.
#
#   tools/pr-comment.sh <pr> <body> [--only-update]
#
# The comment is found by the "<!-- pr-preview -->" marker at the start of the body.
# With --only-update, nothing is posted if there is no comment yet.
set -euo pipefail

pr=$1
# Strip the indentation that YAML block text leaves at the start of each line.
body=$(printf '%s\n' "$2" | sed -E 's/^[[:space:]]+//')
only_update=${3:-}
marker='<!-- pr-preview -->'

id=$(gh api --paginate "repos/$GITHUB_REPOSITORY/issues/$pr/comments" \
  --jq ".[] | select(.user.login == \"github-actions[bot]\" and (.body | startswith(\"$marker\"))) | .id" | head -n 1)

if [ -n "$id" ]; then
  gh api -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$id" -f body="$body" >/dev/null
  echo "Updated comment $id."
elif [ "$only_update" != "--only-update" ]; then
  gh api -X POST "repos/$GITHUB_REPOSITORY/issues/$pr/comments" -f body="$body" >/dev/null
  echo "Posted a new comment."
fi
