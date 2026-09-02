import type { CharacterDailyState, ChatMessage, PhotoAttachment } from "./store";

interface PhotoAsset extends PhotoAttachment {
  id: string;
  caption: string;
  keywords: string[];
}

const PEXELS_LICENSE = "Pexels License";

const PHOTO_ASSETS: PhotoAsset[] = [
  {
    id: "rainy-window-night",
    url: "https://images.pexels.com/photos/28381380/pexels-photo-28381380.jpeg?auto=compress&dpr=1&h=900&w=1200",
    alt: "비 오는 창문 너머로 흐릿하게 보이는 밤 도시",
    caption: "창문에 비 맺힌 거 괜히 예뻐서 찍었다.",
    credit: "Enes Türkoğlu / Pexels",
    sourceUrl: "https://www.pexels.com/photo/a-city-skyline-is-seen-through-a-rain-covered-window-28381380/",
    license: PEXELS_LICENSE,
    keywords: ["비", "비와", "비오는", "창밖", "야경", "밤", "도시"],
  },
  {
    id: "rainy-city-twilight",
    url: "https://images.pexels.com/photos/6210572/pexels-photo-6210572.jpeg?auto=compress&dpr=1&h=900&w=1200",
    alt: "젖은 창문 너머 노을빛 도시 불빛",
    caption: "오늘 창밖이 딱 이런 느낌이었어.",
    credit: "Caio / Pexels",
    sourceUrl: "https://www.pexels.com/photo/view-of-the-city-through-a-wet-window-6210572/",
    license: PEXELS_LICENSE,
    keywords: ["비", "창밖", "노을", "저녁", "도시", "불빛"],
  },
  {
    id: "cafe-window",
    url: "https://images.pexels.com/photos/8417745/pexels-photo-8417745.jpeg?auto=compress&dpr=1&h=900&w=1200",
    alt: "카페 창가와 잔잔한 거리 반사",
    caption: "카페 창가 앉았는데 분위기 괜찮지.",
    credit: "Chris F / Pexels",
    sourceUrl: "https://www.pexels.com/photo/city-street-reflected-in-cafe-window-8417745/",
    license: PEXELS_LICENSE,
    keywords: ["카페", "창가", "커피", "거리", "저녁"],
  },
  {
    id: "subway-station",
    url: "https://images.pexels.com/photos/11278353/pexels-photo-11278353.jpeg?auto=compress&dpr=1&h=900&w=1200",
    alt: "밤의 조용한 지하철역 플랫폼",
    caption: "사람 없는 역은 좀 영화 같지 않냐.",
    credit: "Etkin Celep / Pexels",
    sourceUrl: "https://www.pexels.com/photo/an-empty-subway-station-11278353/",
    license: PEXELS_LICENSE,
    keywords: ["지하철", "역", "퇴근", "플랫폼", "밤"],
  },
  {
    id: "empty-platform",
    url: "https://images.pexels.com/photos/13896505/pexels-photo-13896505.jpeg?auto=compress&dpr=1&h=900&w=1200",
    alt: "어두운 터널로 이어지는 빈 지하철 플랫폼",
    caption: "퇴근길에 이런 데 지나가면 갑자기 조용해짐.",
    credit: "Enes Sözen / Pexels",
    sourceUrl: "https://www.pexels.com/photo/empty-platform-in-subway-13896505/",
    license: PEXELS_LICENSE,
    keywords: ["지하철", "퇴근", "역", "터널", "밤"],
  },
  {
    id: "city-sunset",
    url: "https://images.pexels.com/photos/15540772/pexels-photo-15540772.jpeg?auto=compress&dpr=1&h=900&w=1200",
    alt: "노을 지는 하늘과 도시 실루엣",
    caption: "하늘 색 미쳤길래 너도 보라고.",
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

export function createPhotoShareMessage(input: {
  userMessage: string;
  dailyState: CharacterDailyState | null;
  timestamp: number;
}): ChatMessage | null {
  const text = `${input.userMessage} ${input.dailyState?.event ?? ""} ${input.dailyState?.thoughtAboutUser ?? ""}`;
  if (!PHOTO_INTENT_PATTERN.test(text)) return null;

  const asset = pickPhotoAsset(text);
  return {
    role: "assistant",
    content: asset.caption,
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
