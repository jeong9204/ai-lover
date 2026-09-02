const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const JONGSUNG_COUNT = 28;

function hasFinalConsonant(text: string): boolean {
  const lastChar = [...text.trim()].pop();
  if (!lastChar) return false;

  const code = lastChar.charCodeAt(0);
  if (code < HANGUL_START || code > HANGUL_END) return false;
  return (code - HANGUL_START) % JONGSUNG_COUNT !== 0;
}

export function subjectParticle(text: string): "이" | "가" {
  return hasFinalConsonant(text) ? "이" : "가";
}
