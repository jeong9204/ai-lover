"use client";

import { useEffect, useRef, useState } from "react";
import { PERSONA_NAME, isLaughterOnlyMessage, personaTypeLabel, PersonaType } from "@/lib/persona";
import { formatCallDuration } from "@/lib/events";
import { CallOverlay } from "@/components/CallOverlay";
import { ChatHeader } from "@/components/ChatHeader";
import { ChatInput } from "@/components/ChatInput";
import { MessageList } from "@/components/MessageList";
import { NamePrompt } from "@/components/NamePrompt";
import { Msg } from "@/components/chat-types";

const SESSION_STORAGE_KEY = "ai-lover-session-id";
const NAME_SKIPPED_KEY = "ai-lover-name-skipped";
const DEV_MODE_STORAGE_KEY = "ai-lover-dev-secret";

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
  const [characterName, setCharacterName] = useState(PERSONA_NAME);
  const [personaType, setPersonaType] = useState<PersonaType>("default");
  const [nameSkipped, setNameSkipped] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSubmitting, setNameSubmitting] = useState(false);
  const [activeCall, setActiveCall] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [callEnding, setCallEnding] = useState(false);
  const [laughterGateOpen, setLaughterGateOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const devSecretRef = useRef<string | null>(null);
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
    if (devSecretRef.current) headers.set("x-dev-secret", devSecretRef.current);
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
      setCharacterName(data.characterName ?? PERSONA_NAME);
      setPersonaType(data.personaType ?? "default");
      setDevMode(Boolean(data.devMode));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "이전 대화를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const devParam = params.get("dev");
    if (devParam === "off") {
      localStorage.removeItem(DEV_MODE_STORAGE_KEY);
      devSecretRef.current = null;
      setDevMode(false);
      params.delete("dev");
      window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    } else if (devParam) {
      localStorage.setItem(DEV_MODE_STORAGE_KEY, devParam);
      devSecretRef.current = devParam;
      params.delete("dev");
      window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    } else {
      devSecretRef.current = localStorage.getItem(DEV_MODE_STORAGE_KEY);
    }
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
      setCharacterName(data.characterName ?? characterName);
      setPersonaType(data.personaType ?? personaType);
      if (data.initialMessage) {
        setMessages((prev) => [...prev, data.initialMessage]);
      }
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

  async function unsubscribeCurrentPush() {
    if (!pushSupported) return;
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (!existing) return;

    await fetchWithSession("/api/push/subscribe", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: existing.endpoint }),
    }).catch(() => undefined);
    await existing.unsubscribe();
    setPushSubscribed(false);
  }

  async function resetSession() {
    if (resetting || loading || callEnding) return;
    const ok = window.confirm("지금 대화를 초기화하고 처음부터 다시 시작할까요?");
    if (!ok) return;

    setResetting(true);
    setError(null);
    setLoadError(null);
    setLaughterGateOpen(false);
    setInput("");

    if (callIntervalRef.current) clearInterval(callIntervalRef.current);
    callIntervalRef.current = null;
    setActiveCall(false);
    setCallSeconds(0);

    try {
      await unsubscribeCurrentPush();
      localStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(NAME_SKIPPED_KEY);
      sessionIdRef.current = null;
      setNameSkipped(false);
      setUserName(null);
      setCharacterName(PERSONA_NAME);
      setPersonaType("default");
      setNameInput("");
      setMessages([]);
      setMood("calm");
      setRelationshipStage("오래된 친구");
      setPushStatus("대화를 초기화했어요.");
      await loadSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : "초기화에 실패했어요.");
    } finally {
      setResetting(false);
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
          setCharacterName(data.characterName ?? characterName);
          setPersonaType(data.personaType ?? personaType);
        }
        if (data.devMode !== undefined) setDevMode(Boolean(data.devMode));
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
            content: `${characterName}님이 메시지를 삭제했습니다.`,
            timestamp: Date.now(),
            eventType: "deleted_message",
          },
        ]);
      } else if (data.reply) {
        const appended: Msg[] = [
          {
            role: "assistant",
            content: data.reply,
            timestamp: Date.now(),
            eventType:
              data.event?.type === "call_request"
                ? "call_request"
                : data.event?.type === "confession_ending"
                  ? "confession_ending"
                  : null,
          },
        ];
        if (data.photoMessage) {
          appended.push({
            role: "assistant",
            content: data.photoMessage.content,
            timestamp: Date.now() + 1,
            eventType: data.photoMessage.eventType ?? "photo_shared",
            metadata: data.photoMessage.metadata ?? null,
          });
        }
        setMessages((prev) => [...prev, ...appended]);
      }
      setMood(data.mood ?? "calm");
      setRelationshipStage(data.relationshipStage ?? relationshipStage);
      setCharacterName(data.characterName ?? characterName);
      setPersonaType(data.personaType ?? personaType);
      if (data.devMode !== undefined) setDevMode(Boolean(data.devMode));
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
      setCharacterName(data.characterName ?? characterName);
      setPersonaType(data.personaType ?? personaType);
      if (data.devMode !== undefined) setDevMode(Boolean(data.devMode));
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
      <ChatHeader
        characterName={characterName}
        personaLabel={personaTypeLabel(personaType)}
        relationshipStage={relationshipStage}
        pushSupported={pushSupported}
        pushSubscribed={pushSubscribed}
        resetting={resetting}
        loading={loading}
        callEnding={callEnding}
        devMode={devMode}
        onTogglePushSubscription={togglePushSubscription}
        onResetSession={resetSession}
      />

      {pushStatus && (
        <p className="bg-white/70 px-3 py-1 text-center text-[11px] text-gray-600">{pushStatus}</p>
      )}

      <section className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {loadError && (
          <p className="rounded bg-red-100 px-3 py-2 text-center text-xs text-red-700">
            {loadError}
          </p>
        )}
        {!loadError && userName === null && !nameSkipped && (
          <NamePrompt
            characterName={characterName}
            nameInput={nameInput}
            nameSubmitting={nameSubmitting}
            onNameInputChange={setNameInput}
            onSubmitName={submitName}
            onSkipName={skipName}
          />
        )}
        <MessageList
          messages={messages}
          loading={loading}
          callEnding={callEnding}
          activeCall={activeCall}
          error={error}
          bottomRef={bottomRef}
          onStartCall={startCall}
        />
      </section>

      <ChatInput
        input={input}
        loading={loading}
        laughterGateOpen={laughterGateOpen}
        inputRef={inputRef}
        onInputChange={setInput}
        onRequestSend={requestSend}
        onContinueWriting={continueWriting}
        onPassTurn={passTurn}
      />

      <CallOverlay
        activeCall={activeCall}
        callSeconds={callSeconds}
        characterName={characterName}
        onEndCall={endCall}
      />
    </main>
  );
}
