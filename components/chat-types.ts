export type Role = "user" | "assistant" | "system_event";

export type EventType =
  | "deleted_message"
  | "reconnect_first_message"
  | "call_request"
  | "call_ended"
  | "confession_ending"
  | "photo_shared"
  | "meetup_request"
  | "meetup_completed";

export interface PhotoAttachment {
  url: string;
  alt: string;
  credit: string;
  sourceUrl: string;
  license: string;
}

export interface MessageMetadata {
  photo?: PhotoAttachment;
}

export interface Msg {
  role: Role;
  content: string;
  timestamp: number;
  eventType?: EventType | null;
  metadata?: MessageMetadata | null;
}
