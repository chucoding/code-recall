/** 언어 색상이 없는 저장소 뱃지에 쓰는 중립 배경색 */
export const DEFAULT_BADGE_COLOR = '#30363d';

/** `#rgb` 또는 `#rrggbb` 표기를 0~255 RGB 배열로 변환. 표기가 아니면 null */
function toRgb(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, '');
  const expanded = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  return [
    parseInt(expanded.slice(0, 2), 16),
    parseInt(expanded.slice(2, 4), 16),
    parseInt(expanded.slice(4, 6), 16),
  ];
}

/**
 * 배경색 위에서 읽히는 글자색 반환
 *
 * GitHub 언어 색상은 JavaScript(#f1e05a)처럼 밝은 값부터 Rust(#dea584) 같은 중간 값까지 폭이 넓어
 * 고정 글자색을 쓰면 대비가 무너진다. WCAG 상대 휘도로 밝기를 재서 검정과 흰색 중 하나를 고른다.
 *
 * @param backgroundColor 뱃지 배경색. 없거나 해석할 수 없으면 흰색 글자 반환
 */
export function readableTextColor(backgroundColor: string | null | undefined): string {
  const rgb = backgroundColor ? toRgb(backgroundColor) : null;
  if (!rgb) return '#ffffff';

  const [r, g, b] = rgb.map((channel) => {
    const ratio = channel / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  return luminance > 0.4 ? '#0b1220' : '#ffffff';
}
