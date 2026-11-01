import { z } from "zod";

/** Browser-safe progress payload for UI data-part streaming. */
export const progressPartSchema = z.object({
  type: z.literal("data-progress"),
  id: z.string().min(1),
  data: z.object({
    stage: z.enum(["started", "tool", "synthesizing", "complete"]),
    message: z.string().min(1),
  }),
});

export type ProgressPart = z.infer<typeof progressPartSchema>;
