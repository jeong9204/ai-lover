export interface CharacterProfileImage {
  src: string;
  alt: string;
}

const CHARACTER_IMAGES: Record<string, CharacterProfileImage> = {
  "이준": {
    src: "/characters/leejun.jpg",
    alt: "이준 프로필 이미지",
  },
  "도현": {
    src: "/characters/dohyun.jpg",
    alt: "도현 프로필 이미지",
  },
  "시우": {
    src: "/characters/siwoo.jpg",
    alt: "시우 프로필 이미지",
  },
  "하준": {
    src: "/characters/hajun.jpg",
    alt: "하준 프로필 이미지",
  },
  "태오": {
    src: "/characters/taeo.jpg",
    alt: "태오 프로필 이미지",
  },
  "서진": {
    src: "/characters/seojin.jpg",
    alt: "서진 프로필 이미지",
  },
  "윤재": {
    src: "/characters/yoonjae.jpg",
    alt: "윤재 프로필 이미지",
  },
  "지한": {
    src: "/characters/jihan.jpg",
    alt: "지한 프로필 이미지",
  },
};

export function characterProfileImage(characterName: string): CharacterProfileImage | null {
  return CHARACTER_IMAGES[characterName] ?? null;
}
