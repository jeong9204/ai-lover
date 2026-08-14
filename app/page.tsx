"use client";

import { useEffect, useRef, useState } from "react";
import { PERSONA_NAME, isLaughterOnlyMessage } from "@/lib/persona";
import { formatCallDuration } from "@/lib/events";

type Role = "user" | "assistant" | "system_event";
type EventType = "deleted_message" | "time_skip" | "reconnect_first_message" | "call_request" | "call_ended";
interface Msg {
  role: Role;
  content: string;
  timestamp: number;
  eventType?: EventType | null;
}

const MOOD_LABEL: Record<string, string> = {
  calm: "🙂 평온",
  missing: "🥺 그리움",
  upset: "😤 서운함",
  sulking: "😠 삐짐",
};

const SESSION_STORAGE_KEY = "ai-lover-session-id";
const NAME_SKIPPED_KEY = "ai-lover-name-skipped";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 답장 길이에 비례한 "타이핑 중" 지연 — 너무 즉각적으로 오면 기계적으로 느껴져서 일부러 늦춘다. */
function typingDelayFor(text: string) {
  return Math.min(3500, 600 + text.length * 35);
}

/** VAPID 공개 키(base64url) → Web Push 구독에 필요한 Uint8Array. */
function urlBase64ToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mood, setMood] = useState<string>("calm");
  const [relationshipStage, setRelationshipStage] = useState<string>("오래된 친구");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [nameSkipped, setNameSkipped] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSubmitting, setNameSubmitting] = useState(false);
  const [activeCall, setActiveCall] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [callEnding, setCallEnding] = useState(false);
  const [laughterGateOpen, setLaughterGateOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Msg[]>([]);
  const loadingRef = useRef(false);
  const callIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  function fetchWithSession(url: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (sessionIdRef.current) headers.set("x-session-id", sessionIdRef.current);
    return fetch(url, { ...init, headers });
  }

  async function loadSession() {
    sessionIdRef.current = localStorage.getItem(SESSION_STORAGE_KEY);
    try {
      const res = await fetchWithSession("/api/chat");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "이전 대화를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");

      if (data.sessionId) {
        sessionIdRef.current = data.sessionId;
        localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
      }
      setMessages(data.messages ?? []);
      setMood(data.mood ?? "calm");
      setRelationshipStage(data.relationshipStage ?? "오래된 친구");
      setUserName(data.userName ?? null);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "이전 대화를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  useEffect(() => {
    setNameSkipped(localStorage.getItem(NAME_SKIPPED_KEY) === "1");
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitName() {
    const trimmed = nameInput.trim();
    if (!trimmed || nameSubmitting) return;
    setNameSubmitting(true);
    try {
      const res = await fetchWithSession("/api/session/name", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "이름 저장에 실패했어요.");
      if (data.sessionId) {
        sessionIdRef.current = data.sessionId;
        localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
      }
      setUserName(data.userName ?? trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "이름 저장에 실패했어요.");
    } finally {
      setNameSubmitting(false);
    }
  }

  function skipName() {
    localStorage.setItem(NAME_SKIPPED_KEY, "1");
    setNameSkipped(true);
  }

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("이 브라우저는 웹 푸시를 지원하지 않아요 (Safari는 macOS 13+/PWA 설치 필요).");
      return;
    }
    setPushSupported(true);
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPushSubscribed(!!sub))
      .catch((e) => setPushStatus(`서비스 워커 등록 실패: ${e instanceof Error ? e.message : String(e)}`));
  }, []);

  async function togglePushSubscription() {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      setPushStatus("VAPID 공개키가 클라이언트에 설정되지 않았어요.");
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();

      if (existing) {
        await fetchWithSession("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
        setPushSubscribed(false);
        setPushStatus("알림을 껐어요.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus(`알림 권한이 "${permission}" 상태예요. 브라우저 주소창 왼쪽 아이콘에서 알림 권한을 허용으로 바꿔주세요.`);
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const res = await fetchWithSession("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `구독 저장 실패 (${res.status})`);
      }
      setPushSubscribed(true);
      setPushStatus("알림 구독 완료! 탭을 닫아도 캐릭터가 먼저 연락하면 알려드릴게요.");
    } catch (e) {
      setPushStatus(`구독 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 탭을 열어둔 채 기다리면, 캐릭터가 먼저 말 걸었는지 조용히 주기적으로 확인한다.
  // (전송 중일 때는 건너뛰고, 실패해도 에러 배너 없이 조용히 무시 — 백그라운드 확인이라서)
  // 단, 탭이 안 보이는 동안(다른 탭으로 전환 / 창 최소화)은 폴링을 완전히 멈춘다 — 안 보이는
  // 탭에서도 계속 돌면 브라우저가 타이머를 불규칙하게 스로틀링해서, "5분 후" 같은 경과-시간
  // 문턱을 매번 살짝씩 넘기는 타이밍에 걸려 같은 카드가 반복 생성되는 문제가 있었다.
  // 대신 탭이 다시 보이는 순간 한 번 즉시 확인해서, 자리를 비운 시간 전체가 한 번에 반영되게 한다.
  useEffect(() => {
    async function poll() {
      if (loadingRef.current || !sessionIdRef.current) return;
      try {
        const res = await fetchWithSession("/api/chat");
        if (!res.ok) return;
        const data = await res.json();
        const serverMessages: Msg[] = data.messages ?? [];
        if (serverMessages.length > messagesRef.current.length) {
          setMessages(serverMessages);
          setMood(data.mood ?? "calm");
          setRelationshipStage(data.relationshipStage ?? relationshipStage);
        }
      } catch {
        // 조용히 무시
      }
    }

    let interval: ReturnType<typeof setInterval> | null = null;
    function startPolling() {
      if (interval) return;
      interval = setInterval(poll, 20000);
    }
    function stopPolling() {
      if (interval) clearInterval(interval);
      interval = null;
    }
    function handleVisibilityChange() {
      if (document.hidden) {
        stopPolling();
      } else {
        poll();
        startPolling();
      }
    }

    if (!document.hidden) startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    setInput("");
    setLaughterGateOpen(false);
    setMessages((prev) => [...prev, { role: "user", content: text, timestamp: Date.now() }]);
    setLoading(true);

    try {
      const res = await fetchWithSession("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "오류가 발생했습니다.");

      if (data.sessionId) {
        sessionIdRef.current = data.sessionId;
        localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
      }
      await sleep(typingDelayFor(data.reply ?? ""));

      if (data.event?.type === "deleted_message") {
        setMessages((prev) => [
          ...prev,
          {
            role: "system_event",
            content: `${PERSONA_NAME}님이 메시지를 삭제했습니다.`,
            timestamp: Date.now(),
            eventType: "deleted_message",
          },
        ]);
      } else if (data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.reply,
            timestamp: Date.now(),
            eventType: data.event?.type === "call_request" ? "call_request" : null,
          },
        ]);
      }
      setMood(data.mood ?? "calm");
      setRelationshipStage(data.relationshipStage ?? relationshipStage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  // 전송 버튼/엔터를 누르면 항상 여기를 거친다. 웃음(ㅋㅋㅋ/ㅎㅎㅎ)만 있는 메시지면 바로 보내지 않고
  // "이어쓸래 / 넘어갈래"를 먼저 물어본다 — 아직 할 말이 남았는데 무심코 웃음만 보내고 끝나버리는 걸 막기 위해서.
  function requestSend() {
    const text = input.trim();
    if (!text || loading) return;
    if (isLaughterOnlyMessage(text)) {
      setLaughterGateOpen(true);
      return;
    }
    sendMessage();
  }

  function continueWriting() {
    setLaughterGateOpen(false);
    inputRef.current?.focus();
  }

  function passTurn() {
    setLaughterGateOpen(false);
    sendMessage();
  }

  function startCall() {
    if (activeCall) return;
    setCallSeconds(0);
    setActiveCall(true);
    callIntervalRef.current = setInterval(() => {
      setCallSeconds((s) => s + 1);
    }, 1000);
  }

  async function endCall() {
    if (callIntervalRef.current) clearInterval(callIntervalRef.current);
    callIntervalRef.current = null;
    const durationSec = callSeconds;
    setActiveCall(false);
    setCallEnding(true);

    try {
      const res = await fetchWithSession("/api/chat/call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ durationSec }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "통화 종료 처리에 실패했습니다.");

      const appended: Msg[] = [
        {
          role: "system_event",
          content: data.callEndedMessage?.content ?? `통화 종료 · ${formatCallDuration(durationSec)}`,
          timestamp: Date.now(),
          eventType: "call_ended",
        },
      ];
      if (data.replyMessage) {
        appended.push({
          role: "assistant",
          content: data.replyMessage.content,
          timestamp: Date.now(),
          eventType: data.replyMessage.eventType ?? null,
        });
      }
      setMessages((prev) => [...prev, ...appended]);
      setMood(data.mood ?? mood);
      setRelationshipStage(data.relationshipStage ?? relationshipStage);
      if (data.error) setError(data.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "통화 종료 처리에 실패했습니다.");
    } finally {
      setCallEnding(false);
    }
  }

  useEffect(() => {
    return () => {
      if (callIntervalRef.current) clearInterval(callIntervalRef.current);
    };
  }, []);

  return (
    <main className="mx-auto flex h-screen max-w-md flex-col bg-[#b2c7da]">
      <header className="flex items-center justify-between bg-[#9db8ce] px-4 py-3 shadow">
        <div>
          <h1 className="text-lg font-bold text-gray-800">{PERSONA_NAME}</h1>
          <p className="text-xs text-gray-600">{MOOD_LABEL[mood] ?? mood}</p>
        </div>
        <div className="flex items-center gap-2">
          {pushSupported && (
            <button
              onClick={togglePushSubscription}
              title={pushSubscribed ? "알림 끄기" : "탭을 닫아도 캐릭터가 먼저 연락하면 알림 받기"}
              className="text-lg"
            >
              {pushSubscribed ? "🔔" : "🔕"}
            </button>
          )}
          <p className="text-xs text-gray-600">{relationshipStage}</p>
        </div>
      </header>

      {pushStatus && (
        <p className="bg-white/70 px-3 py-1 text-center text-[11px] text-gray-600">{pushStatus}</p>
      )}

      <section className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {loadError && (
          <p className="rounded bg-red-100 px-3 py-2 text-center text-xs text-red-700">
            {loadError}
          </p>
        )}
        {!loadError && messages.length === 0 && userName === null && !nameSkipped && (
          <div className="mx-auto mt-10 max-w-[85%] rounded-2xl bg-white px-4 py-4 text-center shadow">
            <p className="mb-3 text-sm text-gray-700">{PERSONA_NAME}이 널 뭐라고 부르면 좋을까?</p>
            <input
              className="mb-3 w-full rounded-full border px-4 py-2 text-center text-sm outline-none focus:border-yellow-400"
              placeholder="이름이나 애칭 (선택)"
              value={nameInput}
              maxLength={20}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitName();
              }}
            />
            <div className="flex justify-center gap-2">
              <button
                onClick={submitName}
                disabled={!nameInput.trim() || nameSubmitting}
                className="rounded-full bg-[#fee500] px-4 py-1.5 text-xs font-semibold text-gray-900 disabled:opacity-40"
              >
                이렇게 불러줘
              </button>
              <button
                onClick={skipName}
                className="rounded-full border px-4 py-1.5 text-xs text-gray-600"
              >
                건너뛰기
              </button>
            </div>
          </div>
        )}
        {!loadError && messages.length === 0 && (userName !== null || nameSkipped) && (
          <p className="mt-10 text-center text-sm text-gray-500">
            {PERSONA_NAME}에게 첫 메시지를 보내보세요.
          </p>
        )}
        {messages.map((m, i) =>
          m.eventType === "time_skip" ? (
            <div key={i} className="my-2 flex items-center gap-2 text-gray-500">
              <div className="h-px flex-1 bg-gray-400/40" />
              <span className="text-xs">{m.content}</span>
              <div className="h-px flex-1 bg-gray-400/40" />
            </div>
          ) : m.eventType === "call_ended" ? (
            <div key={i} className="my-2 flex items-center gap-2 text-gray-500">
              <div className="h-px flex-1 bg-gray-400/40" />
              <span className="text-xs">📞 {m.content}</span>
              <div className="h-px flex-1 bg-gray-400/40" />
            </div>
          ) : m.role === "system_event" ? (
            <p key={i} className="py-1 text-center text-xs text-gray-500">
              {m.content}
            </p>
          ) : (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow ${
                  m.role === "user" ? "bg-[#fee500] text-gray-900" : "bg-white text-gray-900"
                }`}
              >
                {m.content}
                {m.eventType === "call_request" &&
                  i === messages.length - 1 &&
                  !activeCall &&
                  !callEnding &&
                  !loading && (
                    <button
                      onClick={startCall}
                      className="mt-2 block w-full rounded-full bg-green-500 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      📞 전화 받기
                    </button>
                  )}
              </div>
            </div>
          )
        )}
        {(loading || callEnding) && (
          <div className="flex justify-start">
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
      </section>

      {laughterGateOpen && (
        <div className="mx-auto mb-2 flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-gray-700 shadow">
          <span>이어서 쓸까요?</span>
          <button
            onClick={continueWriting}
            className="rounded-full bg-[#fee500] px-2.5 py-1 font-semibold text-gray-900"
          >
            ✍️ 이어쓸래
          </button>
          <button onClick={passTurn} className="rounded-full border px-2.5 py-1 text-gray-600">
            ➡️ 넘어갈래
          </button>
        </div>
      )}

      <footer className="flex items-end gap-2 border-t bg-white px-3 py-2">
        <textarea
          ref={inputRef}
          rows={1}
          className="max-h-[4.6rem] flex-1 resize-none overflow-y-auto rounded-2xl border px-4 py-2 text-sm leading-snug outline-none focus:border-yellow-400"
          placeholder="메시지를 입력하세요"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              requestSend();
            }
          }}
          disabled={loading}
        />
        <button
          onClick={requestSend}
          disabled={loading || !input.trim()}
          className="rounded-full bg-[#fee500] px-4 py-2 text-sm font-semibold text-gray-900 disabled:opacity-40"
        >
          전송
        </button>
      </footer>

      {activeCall && (
        <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col items-center justify-between bg-gray-900/95 py-16 text-white">
          <div />
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-24 w-24 animate-pulse items-center justify-center rounded-full bg-white/10 text-4xl">
              📞
            </div>
            <p className="text-lg font-semibold">{PERSONA_NAME}</p>
            <p className="text-sm text-white/70">통화 중 · {formatCallDuration(callSeconds)}</p>
          </div>
          <button
            onClick={endCall}
            title="통화 종료"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 shadow-lg"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 rotate-[135deg] text-white">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
          </button>
        </div>
      )}
    </main>
  );
}
