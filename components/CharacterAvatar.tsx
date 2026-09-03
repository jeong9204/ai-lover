import type { PersonaType } from "@/lib/persona";

interface CharacterAvatarProps {
  characterName: string;
  personaType: PersonaType;
  size?: "sm" | "md";
}

const AVATAR_STYLE: Record<PersonaType, string> = {
  default: "bg-gradient-to-br from-sky-50 via-white to-yellow-100 text-slate-700",
  northern_duke: "bg-gradient-to-br from-slate-900 via-slate-700 to-blue-950 text-white",
  flirty: "bg-gradient-to-br from-rose-100 via-white to-amber-100 text-rose-700",
};

export function CharacterAvatar({ characterName, personaType, size = "md" }: CharacterAvatarProps) {
  const initial = [...characterName.trim()][0] ?? "?";
  const sizeClass = size === "sm" ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm";

  return (
    <div
      aria-label={`${characterName} 프로필`}
      className={`flex shrink-0 items-center justify-center rounded-full border border-white/70 font-bold shadow-sm ${sizeClass} ${AVATAR_STYLE[personaType]}`}
    >
      {initial}
    </div>
  );
}
