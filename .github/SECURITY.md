# Security Policy

## Reporting a vulnerability

**Please do not open a public issue.**

Use GitHub's private reporting: go to the [Security tab](https://github.com/pragyanfyi/unfold/security/advisories/new) and choose **Report a vulnerability**. If that is unavailable, email **pragyan.fyi+unfold@gmail.com** with the subject `SECURITY: Unfold`.

Please include what you found, steps to reproduce, the impact, and any suggested fix.

### What to expect

| Step                   | Target                                            |
| ---------------------- | ------------------------------------------------- |
| Acknowledgement        | within 3 days                                     |
| Initial assessment     | within 7 days                                     |
| Fix or mitigation plan | depends on severity, communicated in the advisory |

We will credit you in the advisory unless you prefer to stay anonymous. Please give us reasonable time to fix an issue before disclosing it publicly.

## Supported versions

Unfold is in early development. Only the latest release and `main` receive security fixes.

## Scope

In scope: the Unfold web application and code in this repository. Out of scope: vulnerabilities in third-party AI providers, Cloudflare, or your own API keys and devices, and issues needing physical access to a device.

## How API keys are handled (bring your own key)

Unfold has no AI gateway. You supply your own provider API key. Unfold uses the [TanStack AI BYOK](https://tanstack.com/ai/latest/docs/advanced/byok) mechanism. Currently only Anthropic keys are supported. How it works:

- **Storage:** the key is kept in your browser only. When your browser supports passkeys, it is stored encrypted with a passkey. When passkeys are unavailable, it is held in memory for the current tab and is gone when you close it. If passkeys are available but your authenticator does not support the required PRF extension, saving the key fails; Unfold tells you so and does not keep the key any other way.
- **Never persisted by us:** Unfold's database (Cloudflare D1), cache (KV) and logs do not store provider keys.
- **Request path:** the key is **not** sent only to the AI provider. For each AI request your browser sends the key in a request header to Unfold's own server route, which makes the call to the provider and then discards the key. **The key therefore passes through Unfold's server in transit on every request**, even though it is never stored.
- **Logging:** raw keys must never be logged. The chat route does not log request headers, masks key-shaped text in every log line and error it returns, and replaces the AI library's own error logging with a version that drops the error object. Automated tests and lint rules check this; they cannot prove no path exists.
- **No server-side key:** the hosted deployment has no fallback key. A request without your key is rejected.

Because keys live in the browser, any cross-site scripting (XSS) flaw could expose them. We therefore send a strict Content-Security-Policy (scripts only from our origin or with a per-response nonce, connections only to our own origin) and treat XSS and CSP gaps as high severity.

If you self-host Unfold, do not enable any server-side fallback key unless you understand that it changes this model.

> What was and was not verified, including that real passkey behaviour and in-browser CSP behaviour were not tested yet, is recorded in [ADR 0003](../docs/adr/0003-bring-your-own-key-handling.md).
