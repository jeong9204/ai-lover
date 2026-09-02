export type Role = "user" | "assistant" | "system_event";

export type EventType =
  | "deleted_message"
  | "reconnect_first_message"
  | "call_request"
  | "call_ended"
  | "confession_ending";

export interface Msg {
  role: Role;
  content: string;
  timestamp: number;
  eventType?: EventType | null;
}
