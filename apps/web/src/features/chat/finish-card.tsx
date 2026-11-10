import { useId, useState } from "react";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";

// After `propose_finish` (ADR 0012, step 5): confirm the summary, or keep going with a note.
export function FinishCard({
  onDecide,
}: {
  onDecide: (confirmed: boolean, text: string | null) => void;
}) {
  const [text, setText] = useState("");
  const noteId = useId();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Is this a shared understanding?</p>
      <Label htmlFor={noteId} className="text-xs text-muted-foreground">
        Something missing? Say what to dig into next.
      </Label>
      <Textarea id={noteId} rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!text.trim()}
          onClick={() => onDecide(false, text)}
        >
          Keep going
        </Button>
        <Button type="button" onClick={() => onDecide(true, null)}>
          Looks right
        </Button>
      </div>
    </div>
  );
}
