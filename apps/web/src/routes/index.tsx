import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main>
      <h1>Unfold</h1>
      <p>Think an idea all the way through. Coming soon.</p>
    </main>
  );
}
