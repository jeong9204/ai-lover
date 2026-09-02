import { PERSONA_NAME } from "@/lib/persona";
import { formatCallDuration } from "@/lib/events";

interface CallOverlayProps {
  activeCall: boolean;
  callSeconds: number;
  onEndCall: () => void;
}

export function CallOverlay({ activeCall, callSeconds, onEndCall }: CallOverlayProps) {
  if (!activeCall) return null;

  return (
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
