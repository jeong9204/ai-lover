import { subjectParticle } from "@/lib/korean-particle";

interface NamePromptProps {
  characterName: string;
  nameInput: string;
  nameSubmitting: boolean;
  onNameInputChange: (value: string) => void;
  onSubmitName: () => void;
  onSkipName: () => void;
}

export function NamePrompt({
  characterName,
  nameInput,
  nameSubmitting,
  onNameInputChange,
  onSubmitName,
  onSkipName,
}: NamePromptProps) {
  const particle = subjectParticle(characterName);

  return (
    <div className="mx-auto mt-10 max-w-[85%] rounded-2xl bg-white px-4 py-4 text-center shadow">
      <p className="mb-3 text-sm text-gray-700">{`${characterName}${particle} 널 뭐라고 부르면 좋을까?`}</p>
      <input
        className="mb-3 w-full rounded-full border px-4 py-2 text-center text-sm outline-none focus:border-yellow-400"
        placeholder="이름이나 애칭 (선택)"
        value={nameInput}
        maxLength={20}
        onChange={(e) => onNameInputChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmitName();
        }}
      />
      <div className="flex justify-center gap-2">
        <button
          onClick={onSubmitName}
          disabled={!nameInput.trim() || nameSubmitting}
          className="rounded-full bg-[#fee500] px-4 py-1.5 text-xs font-semibold text-gray-900 disabled:opacity-40"
        >
          이렇게 불러줘
        </button>
        <button
          onClick={onSkipName}
          className="rounded-full border px-4 py-1.5 text-xs text-gray-600"
        >
          건너뛰기
        </button>
      </div>
    </div>
  );
}
