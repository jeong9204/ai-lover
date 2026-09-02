const KOREA_TIME_ZONE = "Asia/Seoul";

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: KOREA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateLabelFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KOREA_TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

export function koreanDateKey(timestamp = Date.now()): string {
  const parts = dateKeyFormatter.formatToParts(new Date(timestamp));
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

export function koreanDateLabel(timestamp: number): string {
  return dateLabelFormatter.format(new Date(timestamp));
}

export function isDifferentKoreanDay(prevTimestamp: number, currentTimestamp: number): boolean {
  return koreanDateKey(prevTimestamp) !== koreanDateKey(currentTimestamp);
}
