import { koreanDateLabel } from "@/lib/korean-date";

interface DateDividerProps {
  timestamp: number;
}

export function DateDivider({ timestamp }: DateDividerProps) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-full bg-white/55 px-3 py-1 text-[11px] font-medium text-gray-600 shadow-sm">
        {koreanDateLabel(timestamp)}
      </span>
    </div>
  );
}
