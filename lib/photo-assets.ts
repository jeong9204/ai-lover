import type { CharacterDailyState, ChatMessage, PhotoAttachment } from "./store";

interface PhotoAsset extends PhotoAttachment {
  id: string;
  fallbackCaption: string;
  keywords: string[];
}

const PEXELS_LICENSE = "Pexels License";

const PHOTO_ASSETS: PhotoAsset[] = [
  {
    id: "rainy-window-night",
    url: "https://images.pexels.com/photos/28381380/pexels-photo-28381380.jpeg?auto=compress&dpr=1&h=900&w=1200",
    alt: "비 오는 창문 너머로 흐릿하게 보이는 밤 도시",
    fallbackCaption: "이런 창밖이면 말 걸고 싶어지긴 해.",
    credit: "Enes Türkoğlu / Pexels",
    sourceUrl: "https://www.pexels.com/photo/a-city-skyline-is-seen-through-a-rain-covered-window-28381380/",
    license: PEXELS_LICENSE,
    keywords: ["비", "비와", "비오는", "창밖", "야경", "밤", "도시"],
  },
  {
    id: "rainy-city-twilight",
    url: "https://images.pexels.com/photos/6210572/pexels-photo-6210572.jpeg?auto=compress&dpr=1&h=900&w=1200",
    alt: "젖은 창문 너머 노을빛 도시 불빛",
    fallbackCaption: "방금 네 말 듣고 이런 창밖 생각났어.",
    credit: "Caio / Pexels",
    sourceUrl: "https://www.pexels.com/photo/view-of-the-city-through-a-wet-window-6210572/",
    license: PEXELS_LICENSE,
    keywords: ["비", "창밖", "노을", "저녁", "도시", "불빛"],
  },
  {
    id: "cafe-window",
    url: "https://images.pexels.com/photos/8417745/pexels-photo-8417745.jpeg?auto=compress&dpr=1&h=900&w=1200",
    alt: "카페 창가와 잔잔한 거리 반사",
    fallbackCaption: "이런 데 앉아 있으면 너한테 괜히 보내고 싶어짐.",
    credit: "Chris F / Pexels",
    sourceUrl: "https://www.pexels.com/photo/city-street-reflected-in-cafe-window-8417745/",
    license: PEXELS_LICENSE,
    keywords: ["카페", "창가", "커피", "거리", "저녁"],
  },
  {
    id: "subway-station",
    url: "https://images.pexels.com/photos/11278353/pexels-photo-11278353.jpeg?auto=compress&dpr=1&h=900&w=1200",
    alt: "밤의 조용한 지하철역 플랫폼",
    fallbackCaption: "이런 조용한 역 보면 퇴근길 생각나.",
    credit: "Etkin Celep / Pexels",
    sourceUrl: "https://www.pexels.com/photo/an-empty-subway-station-11278353/",
    license: PEXELS_LICENSE,
    keywords: ["지하철", "역", "퇴근", "플랫폼", "밤"],
  },
  {
    id: "empty-platform",
    url: "https://images.pexels.com/photos/13896505/pexels-photo-13896505.jpeg?auto=compress&dpr=1&h=900&w=1200",
    alt: "어두운 터널로 이어지는 빈 지하철 플랫폼",
    fallbackCaption: "퇴근길 얘기하니까 이런 느낌 먼저 떠올랐어.",
    credit: "Enes Sözen / Pexels",
    sourceUrl: "https://www.pexels.com/photo/empty-platform-in-subway-13896505/",
    license: PEXELS_LICENSE,
    keywords: ["지하철", "퇴근", "역", "터널", "밤"],
  },
  {
    id: "city-sunset",
    url: "https://images.pexels.com/photos/15540772/pexels-photo-15540772.jpeg?auto=compress&dpr=1&h=900&w=1200",
    alt: "노을 지는 하늘과 도시 실루엣",
    fallbackCaption: "하늘 얘기 나오니까 이거 보여주고 싶었어.",
    credit: "정규송 Nui MALAMA / Pexels",
    sourceUrl: "https://www.pexels.com/photo/sun-on-sky-over-city-at-sunset-15540772/",
    license: PEXELS_LICENSE,
    keywords: ["하늘", "노을", "석양", "풍경", "도시", "해"],
  },
];

const PHOTO_INTENT_PATTERN = /(사진|풍경|하늘|노을|석양|비|창밖|카페|커피|지하철|역|퇴근길|거리|야경|보여줘|보내줘|찍었|찍어)/;

function scoreAsset(asset: PhotoAsset, text: string): number {
  return asset.keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 1 : 0), 0);
}

function hashText(text: string): number {
  return [...text].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0);
}

function pickPhotoAsset(text: string): PhotoAsset {
  const scored = PHOTO_ASSETS.map((asset) => ({ asset, score: scoreAsset(asset, text) })).sort(
    (a, b) => b.score - a.score
  );
  if (scored[0].score > 0) return scored[0].asset;
  return PHOTO_ASSETS[hashText(text) % PHOTO_ASSETS.length];
}

function photoContextText(userMessage: string, dailyState: CharacterDailyState | null): string {
  return `${userMessage} ${dailyState?.event ?? ""} ${dailyState?.thoughtAboutUser ?? ""}`;
}

function captionFor(asset: PhotoAsset, text: string): string {
  if (/(퇴근길|퇴근|지하철|역|플랫폼)/.test(text)) {
    return "이거, 퇴근길 느낌.";
  }
  if (/(비|비와|비오는|창밖)/.test(text)) {
    return "이거. 비 오는 날 창밖 느낌.";
  }
  if (/(카페|커피|창가)/.test(text)) {
    return "이거. 카페 창가 느낌.";
  }
  if (/(하늘|노을|석양|풍경)/.test(text)) {
    return "이거, 방금 말한 하늘.";
  }
  return asset.fallbackCaption;
}

export function shouldSharePhoto(input: {
  userMessage: string;
  dailyState: CharacterDailyState | null;
}): boolean {
  return PHOTO_INTENT_PATTERN.test(photoContextText(input.userMessage, input.dailyState));
}

export function buildPhotoSharePromptHint(photoMessage: ChatMessage | null): string | null {
  if (!photoMessage?.metadata?.photo) return null;
  return [
    "[사진 전송 힌트]",
    "이번 턴에는 답장 바로 뒤에 사진 메시지가 함께 붙는다.",
    `사진 설명: ${photoMessage.metadata.photo.alt}`,
    `사진 캡션: ${photoMessage.content}`,
    "사진을 나중에 찍어오겠다고 말하지 말고, 지금 바로 보내는 흐름처럼 반응한다.",
    "사진 캡션은 짧은 보조 문장이므로, 본문 답장에서 자연스러운 맥락을 먼저 이어준다.",
    "답장과 사진 캡션이 같은 장면을 말해야 한다. 사진 설명과 맞지 않는 하늘/카페/비 같은 디테일을 새로 만들지 않는다.",
  ].join("\n");
}

export function createPhotoShareMessage(input: {
  userMessage: string;
  dailyState: CharacterDailyState | null;
  timestamp: number;
}): ChatMessage | null {
  const text = photoContextText(input.userMessage, input.dailyState);
  if (!PHOTO_INTENT_PATTERN.test(text)) return null;

  const asset = pickPhotoAsset(text);
  return {
    role: "assistant",
    content: captionFor(asset, text),
    timestamp: input.timestamp,
    eventType: "photo_shared",
    metadata: {
      photo: {
        url: asset.url,
        alt: asset.alt,
        credit: asset.credit,
        sourceUrl: asset.sourceUrl,
        license: asset.license,
      },
    },
  };
}
