import { createFileRoute } from "@tanstack/react-router";

// The screen is drawn by the `_app` layout.
export const Route = createFileRoute("/_app/")({ component: () => null });
