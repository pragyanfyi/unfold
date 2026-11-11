import { createFileRoute } from "@tanstack/react-router";

// The screen is drawn by the `_app` layout, which reads `id` from the address.
export const Route = createFileRoute("/_app/c/$id")({ component: () => null });
