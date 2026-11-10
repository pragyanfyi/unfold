// E2E tests point the provider adapter at a local aimock server (ADR 0011). The URL comes
// from the Worker's own environment, never from the request, so a user cannot redirect their
// key. Only loopback hosts are honoured: even if production were configured with this
// variable by mistake, a key could not be sent to a remote host.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function testProviderBaseUrl(
  value: string | undefined = process.env.UNFOLD_TEST_PROVIDER_URL,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const local = url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
    return local ? value : undefined;
  } catch {
    return undefined;
  }
}
