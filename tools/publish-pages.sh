#!/usr/bin/env bash
# Publishes the game to the gh-pages branch, which GitHub Pages serves.
# Run by .github/workflows/deploy.yml from the repository root.
#
#   tools/publish-pages.sh site [<folder>]           the game goes to the root of the site (previews are kept)
#   tools/publish-pages.sh preview <pr> [<folder>]   the game goes to pr-preview/pr-<pr>/
#   tools/publish-pages.sh remove <pr>               deletes pr-preview/pr-<pr>/
#
# <folder> is the game to publish and defaults to public/. Previews pass the pull request's
# public/ folder, so the pull request's own copy of this script is never the one that runs.
set -euo pipefail

mode=${1:-}
pr=""
if [ "$mode" = preview ] || [ "$mode" = remove ]; then pr=${2:-}; src=${3:-public}; else src=${2:-public}; fi
case "$mode" in
  site) target="" ;;
  preview|remove)
    [[ "$pr" =~ ^[0-9]+$ ]] || { echo "A pull request number is needed, e.g. $0 $mode 12" >&2; exit 1; }
    target="pr-preview/pr-$pr"
    ;;
  *) echo "Usage: $0 site [<folder>] | preview <pr> [<folder>] | remove <pr>" >&2; exit 1 ;;
esac

repo_root=$(pwd)
src=$(cd "$src" && pwd)
[ -f "$src/index.html" ] || { echo "$src has no index.html, so it is not the game folder" >&2; exit 1; }
dir=$(mktemp -d)/gh-pages

cleanup() { git -C "$repo_root" worktree remove --force "$dir" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Another run may push to gh-pages at the same moment, so start again from the latest
# gh-pages each time the push is rejected.
for attempt in 1 2 3 4 5; do
  cleanup
  if git ls-remote --exit-code --heads origin gh-pages >/dev/null; then
    git fetch -q --depth=1 origin +refs/heads/gh-pages:refs/remotes/origin/gh-pages
    git worktree add --detach "$dir" refs/remotes/origin/gh-pages >/dev/null
  else
    # First publish: start an empty branch.
    git worktree add --detach "$dir" HEAD >/dev/null
    git branch -D gh-pages-new >/dev/null 2>&1 || true
    git -C "$dir" checkout -q --orphan gh-pages-new
    git -C "$dir" rm -rfq --ignore-unmatch .
  fi

  case "$mode" in
    site)
      # Replace everything except the previews.
      find "$dir" -mindepth 1 -maxdepth 1 ! -name .git ! -name pr-preview -exec rm -rf {} +
      cp -R "$src/." "$dir/"
      ;;
    preview)
      rm -rf "${dir:?}/$target"
      mkdir -p "$dir/$target"
      cp -R "$src/." "$dir/$target/"
      ;;
    remove)
      rm -rf "${dir:?}/$target"
      ;;
  esac
  touch "$dir/.nojekyll" # serve files as they are, without GitHub's Jekyll step

  git -C "$dir" add -A
  if git -C "$dir" diff --cached --quiet; then
    echo "Nothing to publish."
    exit 0
  fi
  git -C "$dir" \
    -c user.name="github-actions[bot]" \
    -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    commit -qm "Publish ${mode}${pr:+ for #$pr} from ${GITHUB_SHA:-$(git rev-parse --short HEAD)}"
  if git -C "$dir" push -q origin HEAD:refs/heads/gh-pages; then
    echo "Published ${mode}${pr:+ for #$pr} (attempt $attempt)."
    exit 0
  fi
  git -C "$dir" checkout -q --detach  # free the gh-pages-new name for the next attempt
  echo "Push rejected, retrying with the latest gh-pages..." >&2
  sleep $((attempt * 3))
done

echo "Could not publish to gh-pages after 5 attempts." >&2
exit 1
