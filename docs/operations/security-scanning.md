# Security scanning

Automated scanners that run on this repository, and what to do with their output.

| Tool                              | Workflow                          | Runs on                                             | Looks at                                                                                                                                              |
| --------------------------------- | --------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| CodeQL                            | `.github/workflows/codeql.yml`    | PRs to `main`, pushes to `main`, weekly             | JavaScript/TypeScript code and GitHub Actions workflows                                                                                               |
| OpenSSF Scorecard                 | `.github/workflows/scorecard.yml` | Pushes to `main`, weekly, branch-protection changes | Repository security posture (pinned actions, token permissions, branch protection, and so on)                                                         |
| Dependabot                        | `.github/dependabot.yml`          | Weekly                                              | Outdated and vulnerable dependencies                                                                                                                  |
| Secret scanning + push protection | Repository setting                | Every push                                          | Committed credentials                                                                                                                                 |
| CodeRabbit                        | `.coderabbit.yaml`                | PRs, except drafts, Dependabot and release PRs      | Review against `AGENTS.md` and `docs/internals`, plus gitleaks, actionlint and zizmor. Lockfile, generated and `ui/` files are filtered out of review |

## Where to see results

- **CodeQL and Scorecard alerts on `main`:** the repo's **Security → Code scanning** tab. Scorecard findings carry the category `scorecard`.
- **CodeQL alerts introduced by a PR:** the tab lists the default branch first, so PR-only alerts do not show there by default. Look at the PR's **Code scanning** check and its inline annotations, or filter the tab by the PR's branch.
- **Scorecard score:** published once the workflow has run on `main`; the public report is at `https://scorecard.dev/viewer/?uri=github.com/pragyanfyi/unfold`.
- **Dependabot:** **Security → Dependabot**, plus its PRs.

## Triage

1. A new CodeQL alert on a PR: fix it in that PR, or dismiss it in the Security tab with a reason ("false positive", "won't fix", "used in tests") that a reviewer can check.
2. Never dismiss an alert about secrets, key handling or workflow injection without a maintainer's review. See `docs/internals/byok-and-secrets.md`.
3. Scorecard findings are advice, not gates. Fix the cheap ones (pinning, permissions); record deliberate exceptions.

## Known limitations

- **Scorecard's Branch-Protection check:** the default `GITHUB_TOKEN` can read repository rulesets (which this repo uses) but not classic branch protection, which needs an admin-scoped token. Read the check's result and details instead of assuming it is inconclusive. Providing a fine-grained token is optional and not set up. Source: the `ossf/scorecard-action` README, read 2026-11-08.
- **Fork PRs:** CodeQL runs on `pull_request`, and GitHub allows code-scanning uploads from that event even with a read-only token. A failed upload on a fork PR is therefore not expected; investigate it. Scorecard does not run on PRs. Source: GitHub docs, "Resource not accessible by integration", read 2026-11-08.
- CodeQL and Scorecard are **not required checks** (they are not in the branch ruleset). Add them only once they have been stable for a while.
- The Scorecard badge is not in the README yet; add it after the first successful published run.
