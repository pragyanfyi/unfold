# Internals

Rules for working on Unfold's code. They exist so humans, AI agents and CodeRabbit all apply the same standards. Decisions and their reasons live in [`docs/adr`](../adr); procedures live in [`docs/operations`](../operations).

| File                                       | Applies to                                                       |
| ------------------------------------------ | ---------------------------------------------------------------- |
| [web-ui.md](web-ui.md)                     | React components, styling, the decision-tree canvas              |
| [data-fetching.md](data-fetching.md)       | TanStack Query, server functions, loaders                        |
| [hotkeys.md](hotkeys.md)                   | Every keyboard shortcut, and the `Cmd+/` list                    |
| [byok-and-secrets.md](byok-and-secrets.md) | API keys, logging, anything touching credentials                 |
| [testing.md](testing.md)                   | Unit, component and E2E tests (stub until the testing ADR lands) |

## Conventions for these files

- A rule is a short, checkable statement. If it needs a paragraph of reasoning, put the reasoning in an ADR and link it.
- Mark anything undecided as **TBD** instead of guessing. Remove the marker when the decision is made.
- When a rule changes, change it in the same PR as the code that needs the change.
- CodeRabbit applies these files as review criteria through `.coderabbit.yaml`. `path_instructions` add short, focused checks; `knowledge_base.code_guidelines` maps each file here (via `files`/`applyTo`) to the code it governs. When you add a file to this directory, add its mapping there, or it will not apply to application code.
