import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";

const EXAMPLES = [
  "A mobile app that helps neighbours share tools",
  "A subscription box for people learning to cook",
  "A tool that turns meeting notes into follow-up tasks",
];

// Before the first message. Example ideas fill the composer and do not send: a send spends the
// user's own key.
export function EmptyState({
  hasKey,
  keyControl,
  onPick,
}: {
  hasKey: boolean;
  keyControl: ReactNode;
  onPick: (idea: string) => void;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Think an idea all the way through</EmptyTitle>
        <EmptyDescription>
          Describe your idea. Unfold asks the questions that matter, round by round, and grows a
          decision tree as you answer.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {hasKey ? null : (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Unfold needs your own Anthropic API key. It stays in this browser.
            </p>
            {keyControl}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((idea) => (
            <Button
              key={idea}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPick(idea)}
            >
              {idea}
            </Button>
          ))}
        </div>
      </EmptyContent>
    </Empty>
  );
}
