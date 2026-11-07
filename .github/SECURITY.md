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

Unfold has no AI gateway. You supply your own provider API key. Unfold uses the [TanStack AI BYOK](https://tanstack.com/ai/latest/docs/advanced/byok) mechanism. Based on that documentation, the intended design is:

- **Storage:** the key is kept in your browser only. When your browser supports passkeys, it is stored encrypted with a passkey. Otherwise it is held in memory for the current tab and is gone when you close it.
- **Never persisted by us:** Unfold's database (Cloudflare D1), cache (KV) and logs do not store provider keys.
- **Request path:** the key is **not** sent only to the AI provider. For each AI request your browser sends the key in a request header to Unfold's own server route, which makes the call to the provider and then discards the key. **The key therefore passes through Unfold's server in transit on every request**, even though it is never stored.
- **Logging:** raw keys must never be logged. Error strings are masked before logging.

Because keys live in the browser, any cross-site scripting (XSS) flaw could expose them. We therefore treat XSS and Content-Security-Policy gaps as high severity.

If you self-host Unfold, do not enable any server-side fallback key unless you understand that it changes this model.

> This section describes the intended design. It will be re-verified against the implementation when the AI integration lands, and updated if anything differs.
