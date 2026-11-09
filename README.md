# Unfold

> Think an idea all the way through. Unfold asks the hard questions, and you watch the decision tree grow.

Unfold is a chat app for stress-testing ideas. You describe an idea, and an AI interviews you with one question at a time. As you answer, Unfold builds a **decision tree** you can see and explore on an interactive canvas.

**Status:** early development. There is nothing to run yet. Watch the repo or follow the [roadmap](https://github.com/pragyanfyi/unfold/issues) if you are interested.

## How it works

1. Present an idea or ask a question.
2. The AI asks follow-up questions, one branch at a time, until the open decisions are resolved.
3. The conversation is visualised as a decision tree ([React Flow](https://reactflow.dev)).

## Bring your own key

Unfold has no AI gateway and no paid tier. You supply your own provider API key. See [SECURITY.md](.github/SECURITY.md) for exactly how keys are handled.

## Tech stack

- [TanStack Start](https://tanstack.com/start), [Query](https://tanstack.com/query), [Hotkeys](https://tanstack.com/hotkeys) and [AI](https://tanstack.com/ai)
- [React Flow](https://reactflow.dev) for the tree canvas
- [Cloudflare](https://www.cloudflare.com) Workers and D1, with [Drizzle](https://orm.drizzle.team) and [Better Auth](https://www.better-auth.com)
- pnpm workspace, [Biome](https://biomejs.dev), [Vitest](https://vitest.dev) and [Playwright](https://playwright.dev)

## Credits

The interview-style approach is inspired by the `grill-me` skill by [Matt Pocock](https://github.com/mattpocock). Unfold is an independent project and is not affiliated with or endorsed by him.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Security

Please do not open public issues for vulnerabilities. See [SECURITY.md](.github/SECURITY.md).

## License

[MIT](LICENSE)
