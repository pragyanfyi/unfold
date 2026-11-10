import type { UIMessage } from "@tanstack/ai-react";
import { TextPart } from "@tanstack/ai-react/ui";
import { LoaderCircleIcon } from "lucide-react";
import { Bubble, BubbleContent } from "#/components/ui/bubble";
import { Message, MessageContent } from "#/components/ui/message";
import { Trace, TraceIcon, TraceLine, TraceTitle } from "#/components/ui/trace";
import { RoundSummary } from "./parts/round-summary";
import { ThinkingPart } from "./parts/thinking-part";
import type { RoundAnswers } from "./round-answers";
import { askRound, proposeFinish } from "./tools";

export function ChatMessage({
  message,
  streaming,
}: {
  message: UIMessage;
  /** True only for the last message while a reply is streaming. */
  streaming: boolean;
}) {
  if (message.role === "user") {
    const text = message.parts.flatMap((part) => (part.type === "text" ? [part.content] : []));
    return (
      <Message align="end">
        <MessageContent>
          <Bubble align="end" variant="muted">
            <BubbleContent className="whitespace-pre-wrap">{text.join("")}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    );
  }

  const lastIndex = message.parts.length - 1;
  return (
    <Message align="start">
      <MessageContent>
        {message.parts.map((part, index) => {
          if (part.type === "thinking") {
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: parts of a message only ever append, so the index is stable.
              <Trace key={`thinking-${index}`}>
                <ThinkingPart content={part.content} running={streaming && index === lastIndex} />
              </Trace>
            );
          }
          if (part.type === "text") {
            return part.content.trim() ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: parts of a message only ever append, so the index is stable.
              <TextPart key={`text-${index}`} content={part.content} />
            ) : null;
          }
          if (part.type === "tool-call" && part.name === askRound.name) {
            const parsed = askRound.inputSchema.safeParse(part.input);
            // An answered round is summarised here. An unanswered one is in the dock.
            if (parsed.success && part.output !== undefined) {
              return (
                <Trace key={part.id}>
                  <RoundSummary
                    input={parsed.data}
                    answers={(part.output as RoundAnswers | undefined)?.answers}
                  />
                </Trace>
              );
            }
            if (!parsed.success && streaming) {
              return (
                <Trace key={part.id}>
                  <TraceLine status="running">
                    <TraceIcon>
                      <LoaderCircleIcon className="animate-spin" />
                    </TraceIcon>
                    <TraceTitle>Preparing questions</TraceTitle>
                  </TraceLine>
                </Trace>
              );
            }
            return null;
          }
          if (part.type === "tool-call" && part.name === proposeFinish.name) {
            const parsed = proposeFinish.inputSchema.safeParse(part.input);
            return parsed.success ? <TextPart key={part.id} content={parsed.data.summary} /> : null;
          }
          return null;
        })}
      </MessageContent>
    </Message>
  );
}
