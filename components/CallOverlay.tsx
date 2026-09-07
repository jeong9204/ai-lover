import { formatCallDuration } from "@/lib/events";
import { characterProfileImage } from "@/lib/character-profile";
import type { PersonaType } from "@/lib/persona";

interface CallOverlayProps {
  activeCall: boolean;
  callSeconds: number;
  characterName: string;
  personaType: PersonaType;
  onEndCall: () => void;
}

export function CallOverlay({ activeCall, callSeconds, characterName, personaType, onEndCall }: CallOverlayProps) {
  if (!activeCall) return null;
  const image = characterProfileImage(characterName);
  const initial = [...characterName.trim()][0] ?? "?";
  const fallbackClass =
    personaType === "northern_duke"
      ? "from-slate-950 via-slate-800 to-blue-950 text-white"
      : personaType === "flirty"
        ? "from-rose-100 via-white to-amber-100 text-rose-700"
        : "from-sky-50 via-white to-yellow-100 text-slate-700";

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col items-center justify-between bg-slate-950/90 px-6 py-16 text-white backdrop-blur-sm">
      <div />
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex h-36 w-36 items-center justify-center">
          <span className="call-ring absolute h-full w-full rounded-full border border-white/25" />
          <span className="call-ring absolute h-full w-full rounded-full border border-white/15 [animation-delay:1s]" />
          <div className="absolute h-28 w-28 rounded-full bg-white/10 blur-xl" />
          <div className={`relative h-28 w-28 overflow-hidden rounded-full border-2 border-white/80 bg-gradient-to-br shadow-2xl ${fallbackClass}`}>
            {image ? (
              <img src={image.src} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-4xl font-bold">{initial}</div>
            )}
          </div>
          <div className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white/90 text-slate-900 shadow-lg">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
          </div>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold tracking-normal">{characterName}</p>
          <p className="mt-2 text-sm font-medium text-white/75">통화 중 · {formatCallDuration(callSeconds)}</p>
        </div>
      </div>
      <button
        onClick={onEndCall}
        title="통화 종료"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 shadow-lg"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 rotate-[135deg] text-white">
          <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
        </svg>
      </button>
    </div>
  );
}
