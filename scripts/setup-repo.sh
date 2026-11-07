#!/usr/bin/env bash
# Applies Unfold's GitHub repository settings, labels and branch ruleset.
#
# Usage:
#   scripts/setup-repo.sh                              # dry run (default)
#   scripts/setup-repo.sh --apply                      # phase 1: apply
#   scripts/setup-repo.sh --apply --with-ci-check      # phase 2: also require "Check"
#
# Run it AFTER the repo exists and its first commit is on main (the ruleset
# blocks direct pushes). Phase 2 is run once ci.yml has merged and run, because
# a required check that does not exist yet would block every PR.
# Needs `gh auth` as a repo admin. Safe to re-run.
set -euo pipefail

REPO="${REPO:-pragyanfyi/unfold}"
APPLY=0
WITH_CI_CHECK=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --with-ci-check) WITH_CI_CHECK=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

run() {
  if [ "$APPLY" -eq 1 ]; then
    "$@"
  else
    printf '[dry-run]'; printf ' %q' "$@"; printf '\n'
  fi
}

api() { # api METHOD PATH [gh api args...]
  local method="$1" path="$2"; shift 2
  run gh api -X "$method" "repos/$REPO/$path" "$@"
}

echo "== Repository settings ($REPO)"
run gh api -X PATCH "repos/$REPO" \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F allow_auto_merge=true \
  -F delete_branch_on_merge=true \
  -F has_discussions=true \
  -F has_wiki=false \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY

echo "== Security features"
api PUT private-vulnerability-reporting
api PUT vulnerability-alerts
api PUT automated-security-fixes
run gh api -X PATCH "repos/$REPO" --input - <<'JSON'
{"security_and_analysis":{
  "secret_scanning":{"status":"enabled"},
  "secret_scanning_push_protection":{"status":"enabled"}}}
JSON

echo "== Labels"
label() { # name color description
  run gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force
}
label "type:bug"        d73a4a "Something is broken"
label "type:feature"    0e8a16 "New capability"
label "type:docs"       0075ca "Documentation"
label "type:chore"      cfd3d7 "Maintenance"
label "area:web"        1d76db "Web app"
label "area:auth"       1d76db "Authentication"
label "area:ai"         1d76db "AI and chat"
label "area:canvas"     1d76db "Decision tree canvas"
label "area:db"         1d76db "Database and caching"
label "good first issue" 7057ff "Good for newcomers"
label "help wanted"     008672 "Maintainers welcome a PR"
label "needs-triage"    fbca04 "Not yet reviewed by a maintainer"
label "needs-more-info" fbca04 "Waiting on the reporter"
label "stale"           ededed "No recent activity"
label "dependencies"    0366d6 "Dependency updates"

echo "== Branch ruleset: Protect main"
# Phase 1 (default): only the checks that exist before ci.yml does.
# Phase 2: after ci.yml has merged and run once, re-run with --with-ci-check.
if [ "$WITH_CI_CHECK" -eq 1 ]; then
  REQUIRED_CHECKS_JSON='[{"context":"Check"},{"context":"Validate PR title"},{"context":"DCO"}]'
else
  REQUIRED_CHECKS_JSON='[{"context":"Validate PR title"},{"context":"DCO"}]'
fi
RULESET='{
  "name": "Protect main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
  "bypass_actors": [
    {"actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request"}
  ],
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"},
    {"type": "required_linear_history"},
    {"type": "pull_request", "parameters": {
      "required_approving_review_count": 0,
      "dismiss_stale_reviews_on_push": true,
      "require_code_owner_review": false,
      "require_last_push_approval": false,
      "required_review_thread_resolution": true,
      "allowed_merge_methods": ["squash"]
    }},
    {"type": "required_status_checks", "parameters": {
      "strict_required_status_checks_policy": false,
      "required_status_checks": '"$REQUIRED_CHECKS_JSON"'
    }}
  ]
}'

if [ "$APPLY" -eq 1 ]; then
  existing="$(gh api "repos/$REPO/rulesets" --jq '.[] | select(.name=="Protect main") | .id' || true)"
  if [ -n "$existing" ]; then
    echo "$RULESET" | gh api -X PUT "repos/$REPO/rulesets/$existing" --input -
  else
    echo "$RULESET" | gh api -X POST "repos/$REPO/rulesets" --input -
  fi
else
  echo "[dry-run] would create/update ruleset:"; echo "$RULESET"
fi

echo "Done. Manual steps: install the CodeRabbit GitHub App; enable Discussions categories (Ideas, Q&A)."
