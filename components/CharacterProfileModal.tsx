import { CharacterAvatar } from "@/components/CharacterAvatar";
import { characterProfileImage } from "@/lib/character-profile";
import type { PersonaType } from "@/lib/persona";
import { buildMoodLabel, buildStatusMessage, buildTodayStatus } from "@/lib/profile-status";
import type { CharacterDailyState } from "@/lib/store";

interface CharacterProfileModalProps {
  open: boolean;
  characterName: string;
  personaType: PersonaType;
  personaLabel: string;
  relationshipStage: string;
  mood: string;
  dailyState: CharacterDailyState | null;
  onClose: () => void;
}

export function CharacterProfileModal({
  open,
  characterName,
  personaType,
  personaLabel,
  relationshipStage,
  mood,
  dailyState,
  onClose,
}: CharacterProfileModalProps) {
  if (!open) return null;
  const image = characterProfileImage(characterName);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 px-3 py-4 sm:items-center">
      <button
        type="button"
        aria-label="프로필 닫기"
        className="absolute inset-0"
        onClick={onClose}
      />
      <section className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-5 text-gray-900 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-3 text-xl leading-none text-gray-400"
          aria-label="프로필 닫기"
        >
          x
        </button>

        {image ? (
          <div className="-mx-1 -mt-1 mb-4 overflow-hidden rounded-xl bg-gray-100">
            <img src={image.src} alt={image.alt} className="aspect-[4/3] w-full object-cover" />
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <CharacterAvatar characterName={characterName} personaType={personaType} size={image ? "md" : "lg"} />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{characterName}</h2>
            <p className="text-xs text-gray-500">
              {personaLabel} · {relationshipStage}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3">
          <p className="text-[11px] font-semibold text-gray-400">상태 메시지</p>
          <p className="mt-1 text-sm font-medium">{buildStatusMessage(personaType, mood, dailyState)}</p>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm">
          <div>
            <dt className="text-[11px] font-semibold text-gray-400">오늘</dt>
            <dd className="mt-1 text-gray-700">{buildTodayStatus(dailyState)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-gray-400">기분</dt>
            <dd className="mt-1 text-gray-700">{buildMoodLabel(dailyState?.mood ?? mood)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
