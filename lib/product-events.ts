import { supabase } from "./supabase";

export type ProductEventName =
  | "relationship_stage_changed"
  | "call_started"
  | "call_completed"
  | "meetup_started"
  | "meetup_completed"
  | "feedback_bonus_exposed";

export type ProductEventWriteStatus = "created" | "duplicate" | "unavailable" | "error";

interface ProductEventInput {
  sessionId: string;
  eventName: ProductEventName;
  dedupeKey: string;
  eventData?: Record<string, string | number | boolean | null>;
  createdAt?: number;
}

function isMissingProductEventsTable(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === "42P01" ||
    candidate.code === "PGRST205" ||
    /product_events.*(does not exist|could not find)/i.test(candidate.message ?? "") ||
    /could not find.*product_events/i.test(candidate.message ?? "")
  );
}

export async function recordProductEvent(input: ProductEventInput): Promise<ProductEventWriteStatus> {
  const dedupeKey = input.dedupeKey.trim().slice(0, 160);
  if (!dedupeKey) return "error";

  const { error } = await supabase.from("product_events").insert({
    session_id: input.sessionId,
    event_name: input.eventName,
    event_data: input.eventData ?? {},
    dedupe_key: dedupeKey,
    ...(input.createdAt !== undefined
      ? { created_at: new Date(input.createdAt).toISOString() }
      : {}),
  });

  if (!error) return "created";
  if (String((error as { code?: string }).code ?? "") === "23505") return "duplicate";
  if (isMissingProductEventsTable(error)) return "unavailable";
  return "error";
}

export async function recordRelationshipStageChange(input: {
  sessionId: string;
  previousStage: string;
  nextStage: string;
  userMessageCount: number;
  dedupeKey: string;
  createdAt?: number;
}): Promise<ProductEventWriteStatus | "unchanged"> {
  if (input.previousStage === input.nextStage) return "unchanged";
  return recordProductEvent({
    sessionId: input.sessionId,
    eventName: "relationship_stage_changed",
    dedupeKey: input.dedupeKey,
    createdAt: input.createdAt,
    eventData: {
      from: input.previousStage,
      to: input.nextStage,
      userMessageCount: input.userMessageCount,
    },
  });
}
