// Stands in for the React Flow canvas until #30 replaces it.
export function CanvasPlaceholder() {
  return (
    <section
      aria-label="Decision tree"
      className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground"
    >
      The decision tree will grow here as you answer.
    </section>
  );
}
