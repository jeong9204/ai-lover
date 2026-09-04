interface LimitFeedbackPanelProps {
  message: string;
  feedback: string;
  submitting: boolean;
  error: string | null;
  onFeedbackChange: (value: string) => void;
  onSubmit: () => void;
}

export function LimitFeedbackPanel({
  message,
  feedback,
  submitting,
  error,
  onFeedbackChange,
  onSubmit,
}: LimitFeedbackPanelProps) {
  const canSubmit = feedback.trim().length >= 10 && !submitting;

  return (
    <div className="rounded-xl bg-white/85 px-4 py-3 text-sm text-gray-800 shadow">
      <p className="font-semibold">{message}</p>
      <p className="mt-1 text-xs text-gray-500">
        피드백은 현재 대화 상태와 마지막 메시지 일부와 함께 저장돼요.
      </p>
      <textarea
        className="mt-3 min-h-20 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-yellow-400"
        placeholder="어느 부분이 어색했는지, 어디서 더 대화하고 싶었는지 알려주세요."
        value={feedback}
        onChange={(event) => onFeedbackChange(event.target.value)}
        maxLength={1000}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">{feedback.trim().length}/1000</span>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="rounded-full bg-[#fee500] px-4 py-1.5 text-xs font-semibold text-gray-900 disabled:opacity-40"
        >
          {submitting ? "저장 중" : "피드백 남기고 20회 추가"}
        </button>
      </div>
    </div>
  );
}
