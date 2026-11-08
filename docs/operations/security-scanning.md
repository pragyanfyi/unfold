# Security scanning

Automated scanners that run on this repository, and what to do with their output.

| Tool                              | Workflow                          | Runs on                                             | Looks at                                                                                      |
| --------------------------------- | --------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| CodeQL                            | `.github/workflows/codeql.yml`    | PRs to `main`, pushes to `main`, weekly             | JavaScript/TypeScript code and GitHub Actions workflows                                       |
| OpenSSF Scorecard                 | `.github/workflows/scorecard.yml` | Pushes to `main`, weekly, branch-protection changes | Repository security posture (pinned actions, token permissions, branch protection, and so on) |
| Dependabot                        | `.github/dependabot.yml`          | Weekly                                              | Outdated and vulnerable dependencies                                                          |
| Secret scanning + push protection | Repository setting                | Every push                                          | Committed credentials                                                                         |
| CodeRabbit                        | `.coderabbit.yaml`                | Every PR                                            | Review against `AGENTS.md` and `docs/internals`, plus gitleaks, actionlint and zizmor         |

## Where to see results

- **CodeQL and Scorecard alerts:** the repo's **Security → Code scanning** tab. Scorecard findings carry the category `scorecard`.
- **Scorecard score:** published once the workflow has run on `main`; the public report is at `https://scorecard.dev/viewer/?uri=github.com/pragyanfyi/unfold`.
- **Dependabot:** **Security → Dependabot**, plus its PRs.

## Triage

1. A new CodeQL alert on a PR: fix it in that PR, or dismiss it in the Security tab with a reason ("false positive", "won't fix", "used in tests") that a reviewer can check.
2. Never dismiss an alert about secrets, key handling or workflow injection without a maintainer's review. See `docs/internals/byok-and-secrets.md`.
3. Scorecard findings are advice, not gates. Fix the cheap ones (pinning, permissions); record deliberate exceptions.

## Known limitations

- **Scorecard's Branch-Protection check** needs a token with admin read access to the repository's protection settings. The default `GITHUB_TOKEN` cannot read them, so that check reports as inconclusive. Providing a fine-grained token for it is optional and not set up.
- **Fork PRs** get a read-only token, so code-scanning results cannot be uploaded from them. A failure on the upload step of a fork PR is expected and is not a code problem.
- CodeQL and Scorecard are **not required checks** (they are not in the branch ruleset). Add them only once they have been stable for a while.
- The Scorecard badge is not in the README yet; add it after the first successful published run.
