import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="mx-auto my-16 w-[min(42rem,calc(100%-2rem))]">
      <h1 className="mb-4 text-3xl font-semibold">Unfold</h1>
      <p className="text-muted-foreground">Think an idea all the way through. Coming soon.</p>
    </main>
  );
}
