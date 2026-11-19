// Injected at build time by vite.config.ts (`define`).
declare const __APP_VERSION__: string;

// Our Convex deployment's exact origins for the CSP's connect-src (ADR 0015), checked and set at
// build time by vite.config.ts from VITE_CONVEX_URL and VITE_CONVEX_SITE_URL. Empty when unset.
declare const __CONVEX_ORIGINS__: ReadonlyArray<string>;
// The HTTP actions origin of our Convex deployment (`convexSiteUrl`), empty without one.
declare const __CONVEX_SITE_URL__: string;
