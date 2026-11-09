import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

// The interview tool protocol from ADR 0012. Both tools are declared WITHOUT an
// `execute` handler on purpose: the agent loop then ends the run after the model's
// tool call instead of calling the model again (verified with `fakeText()`, see
// ADR 0012). Validation of what the model sent belongs to the validator and
// `deriveTree`, not to this route.

const settledSchema = z.array(
  z.object({
    id: z.string().min(1),
    decision: z.string().min(1),
    status: z.enum(["settled", "open"]),
  }),
);

const questionSchema = z.object({
  title: z.string().min(1),
  body: z.string(),
  label: z.string().min(1).max(80),
  // The first option is always the model's recommendation (ADR 0012).
  options: z
    .array(z.object({ label: z.string().min(1) }))
    .min(2)
    .max(4),
  parentId: z.string().min(1),
  dependsOn: z.array(z.string().min(1)).optional(),
  revisits: z.string().min(1).optional(),
});

export const askRound = toolDefinition({
  name: "ask_round",
  description:
    "Ask the whole current frontier of decisions in one round. Option A is your recommendation.",
  inputSchema: z.object({
    settled: settledSchema,
    questions: z.array(questionSchema).min(1),
  }),
});

export const proposeFinish = toolDefinition({
  name: "propose_finish",
  description: "Say the frontier is empty and give a closing summary of the shared understanding.",
  inputSchema: z.object({
    settled: settledSchema,
    summary: z.string().min(1),
  }),
});

export const interviewTools = [askRound, proposeFinish] as const;
