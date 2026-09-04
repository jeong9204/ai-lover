import { RefObject } from "react";

interface ChatInputProps {
  input: string;
  loading: boolean;
  laughterGateOpen: boolean;
  inputRef: RefObject<HTMLTextAreaElement>;
  onInputChange: (value: string) => void;
  onRequestSend: () => void;
  onContinueWriting: () => void;
  onPassTurn: () => void;
}

export function ChatInput({
  input,
  loading,
  laughterGateOpen,
  inputRef,
  onInputChange,
  onRequestSend,
  onContinueWriting,
  onPassTurn,
}: ChatInputProps) {
  return (
    <>
      {laughterGateOpen && (
        <div className="mx-auto mb-2 flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-gray-700 shadow">
          <span>이어서 쓸까요?</span>
          <button
            onClick={onContinueWriting}
            className="rounded-full bg-[#fee500] px-2.5 py-1 font-semibold text-gray-900"
          >
            ✍️ 이어쓸래
          </button>
          <button onClick={onPassTurn} className="rounded-full border px-2.5 py-1 text-gray-600">
            ➡️ 넘어갈래
          </button>
        </div>
      )}

      <footer className="chat-input-footer flex w-full shrink-0 items-end gap-2 border-t bg-white px-3 pt-2">
        <textarea
          ref={inputRef}
          rows={1}
          className="max-h-[calc(4.125em+1rem)] min-w-0 flex-1 resize-none overflow-y-auto rounded-2xl border px-4 py-2 text-base leading-snug outline-none focus:border-yellow-400 sm:text-sm"
          placeholder="메시지를 입력하세요"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onRequestSend();
            }
          }}
          disabled={loading}
        />
        <button
          onClick={onRequestSend}
          disabled={loading || !input.trim()}
          className="shrink-0 rounded-full bg-[#fee500] px-3.5 py-2 text-sm font-semibold text-gray-900 disabled:opacity-40"
        >
          전송
        </button>
      </footer>
    </>
  );
}
