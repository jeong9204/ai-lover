export interface CharacterProfileImage {
  src: string;
  alt: string;
}

const CHARACTER_IMAGES: Record<string, CharacterProfileImage> = {
  "태오": {
    src: "/characters/taeo.jpg",
    alt: "태오 프로필 이미지",
  },
};

export function characterProfileImage(characterName: string): CharacterProfileImage | null {
  return CHARACTER_IMAGES[characterName] ?? null;
}
