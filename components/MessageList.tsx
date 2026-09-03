import { Fragment, RefObject } from "react";
import { CharacterAvatar } from "@/components/CharacterAvatar";
import { DateDivider } from "@/components/DateDivider";
import { Msg } from "@/components/chat-types";
import { isDifferentKoreanDay } from "@/lib/korean-date";
import type { PersonaType } from "@/lib/persona";

interface MessageListProps {
  messages: Msg[];
  characterName: string;
  personaType: PersonaType;
  loading: boolean;
  callEnding: boolean;
  activeCall: boolean;
  error: string | null;
  bottomRef: RefObject<HTMLDivElement>;
  onStartCall: () => void;
}

export function MessageList({
  messages,
  characterName,
  personaType,
  loading,
  callEnding,
  activeCall,
  error,
  bottomRef,
  onStartCall,
}: MessageListProps) {
  function renderAssistantBubble(m: Msg, isLatest: boolean) {
    const photo = m.metadata?.photo;

    return (
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow ${
          m.role === "user" ? "bg-[#fee500] text-gray-900" : "bg-white text-gray-900"
        }`}
      >
        {photo && (
          <a
            href={photo.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="-mx-1 mb-2 block overflow-hidden rounded-xl bg-gray-100"
            aria-label={`${photo.alt} 원본 보기`}
          >
            <img
              src={photo.url}
              alt={photo.alt}
              className="aspect-[4/3] max-h-80 w-full object-cover"
              loading="lazy"
            />
          </a>
        )}
        <p className="whitespace-pre-wrap break-words">{m.content}</p>
        {photo && (
          <p className="mt-1 text-[10px] leading-tight text-gray-400">
            Photo: {photo.credit}
          </p>
        )}
        {m.eventType === "call_request" &&
          isLatest &&
          !activeCall &&
          !callEnding &&
          !loading && (
            <button
              onClick={onStartCall}
              className="mt-2 block w-full rounded-full bg-green-500 px-3 py-1.5 text-xs font-semibold text-white"
            >
              📞 전화 받기
            </button>
          )}
      </div>
    );
  }

  return (
    <>
      {messages.map((m, i) => {
        const showDateDivider = i === 0 || isDifferentKoreanDay(messages[i - 1].timestamp, m.timestamp);
        const previousMessage = messages[i - 1];
        const showAvatar =
          m.role === "assistant" &&
          (showDateDivider || !previousMessage || previousMessage.role !== "assistant");

        return (
          <Fragment key={i}>
            {showDateDivider && <DateDivider timestamp={m.timestamp} />}
            {m.eventType === "call_ended" ? (
              <div className="my-2 flex items-center gap-2 text-gray-500">
                <div className="h-px flex-1 bg-gray-400/40" />
                <span className="text-xs">📞 {m.content}</span>
                <div className="h-px flex-1 bg-gray-400/40" />
              </div>
            ) : m.eventType === "meetup_completed" ? (
              <div className="my-3 flex items-center gap-2 text-gray-500">
                <div className="h-px flex-1 bg-gray-400/40" />
                <span className="rounded-full bg-white/50 px-3 py-1 text-xs">{m.content}</span>
                <div className="h-px flex-1 bg-gray-400/40" />
              </div>
            ) : m.role === "system_event" ? (
              <p className="py-1 text-center text-xs text-gray-500">
                {m.content}
              </p>
            ) : m.eventType === "confession_ending" ? (
              <div className="my-2 flex flex-col items-center gap-2">
                <div className="flex w-full items-center gap-2 text-pink-500">
                  <div className="h-px flex-1 bg-pink-300/60" />
                  <span className="text-xs font-semibold">💕 이제 두 사람은 연인이에요</span>
                  <div className="h-px flex-1 bg-pink-300/60" />
                </div>
                <div className="flex items-start gap-2 self-start">
                  {showAvatar ? (
                    <CharacterAvatar characterName={characterName} personaType={personaType} />
                  ) : (
                    <div className="h-9 w-9 shrink-0" />
                  )}
                  <div className="max-w-[75%] rounded-2xl border border-pink-200 bg-pink-50 px-3 py-2 text-sm text-gray-900 shadow">
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} items-start gap-2`}>
                {m.role === "assistant" &&
                  (showAvatar ? (
                    <CharacterAvatar characterName={characterName} personaType={personaType} />
                  ) : (
                    <div className="h-9 w-9 shrink-0" />
                  ))}
                {renderAssistantBubble(m, i === messages.length - 1)}
              </div>
            )}
          </Fragment>
        );
      })}
      {(loading || callEnding) && (
        <div className="flex items-start justify-start gap-2">
          <CharacterAvatar characterName={characterName} personaType={personaType} />
          <div className="flex items-center gap-1 rounded-2xl bg-white px-4 py-3 shadow">
            <span className="typing-dot h-2 w-2 rounded-full bg-gray-400" />
            <span className="typing-dot h-2 w-2 rounded-full bg-gray-400" />
            <span className="typing-dot h-2 w-2 rounded-full bg-gray-400" />
          </div>
        </div>
      )}
      {error && (
        <p className="rounded bg-red-100 px-3 py-2 text-xs text-red-700">{error}</p>
      )}
      <div ref={bottomRef} />
    </>
  );
}
