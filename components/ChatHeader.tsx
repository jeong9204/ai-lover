import { CharacterAvatar } from "@/components/CharacterAvatar";
import type { PersonaType } from "@/lib/persona";

interface ChatHeaderProps {
  characterName: string;
  personaType: PersonaType;
  personaLabel: string;
  relationshipStage: string;
  pushSupported: boolean;
  pushSubscribed: boolean;
  resetting: boolean;
  loading: boolean;
  callEnding: boolean;
  devMode: boolean;
  onTogglePushSubscription: () => void;
  onResetSession: () => void;
  onOpenProfile: () => void;
}

export function ChatHeader({
  characterName,
  personaType,
  personaLabel,
  relationshipStage,
  pushSupported,
  pushSubscribed,
  resetting,
  loading,
  callEnding,
  devMode,
  onTogglePushSubscription,
  onResetSession,
  onOpenProfile,
}: ChatHeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 bg-[#9db8ce] px-4 py-3 shadow">
      <div className="flex min-w-0 items-center gap-2">
        <CharacterAvatar
          characterName={characterName}
          personaType={personaType}
          size="sm"
          interactive
          onClick={onOpenProfile}
        />
        <h1 className="truncate text-lg font-bold text-gray-800">{characterName}</h1>
      </div>
      <div className="flex min-w-0 shrink items-center justify-end gap-2">
        {pushSupported && (
          <button
            onClick={onTogglePushSubscription}
            disabled={resetting}
            title={pushSubscribed ? "알림 끄기" : "탭을 닫아도 캐릭터가 먼저 연락하면 알림 받기"}
            className="text-lg disabled:opacity-40"
          >
            {pushSubscribed ? "🔔" : "🔕"}
          </button>
        )}
        {devMode && (
          <>
            <button
              onClick={onResetSession}
              disabled={resetting || loading || callEnding}
              title="대화 초기화"
              className="text-sm font-semibold text-gray-600 disabled:opacity-40"
            >
              초기화
            </button>
            <span className="text-[10px] font-semibold text-gray-500">DEV</span>
          </>
        )}
        <p className="truncate text-xs text-gray-600">
          {personaLabel} · {relationshipStage}
        </p>
      </div>
    </header>
  );
}
