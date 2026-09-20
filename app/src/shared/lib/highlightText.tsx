import React from 'react';

/** 하이라이트용 배경색 (ui-ux-pro-max 색상 참고: 부드러운 앰버, 가독성 유지) */
const HIGHLIGHT_CLASS = 'bg-amber-100/80 text-inherit rounded-sm px-0.5';

type Segment = { type: 'normal' | 'highlight'; start: number; end: number };

/**
 * 원문에서 highlight 구간을 찾아 병합한 뒤, normal/highlight 세그먼트 배열로 반환
 */
function getMergedRanges(text: string, phrases: string[]): Segment[] {
  const ranges: { start: number; end: number }[] = [];
  for (const phrase of phrases) {
    const trimmed = phrase.trim();
    if (!trimmed) continue;
    let idx = 0;
    while ((idx = text.indexOf(trimmed, idx)) !== -1) {
      ranges.push({ start: idx, end: idx + trimmed.length });
      idx += trimmed.length;
    }
  }
  if (ranges.length === 0) return [{ type: 'normal', start: 0, end: text.length }];

  ranges.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    if (merged.length && r.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
    } else {
      merged.push({ start: r.start, end: r.end });
    }
  }

  const segments: Segment[] = [];
  let last = 0;
  for (const r of merged) {
    if (r.start > last) {
      segments.push({ type: 'normal', start: last, end: r.start });
    }
    segments.push({ type: 'highlight', start: r.start, end: r.end });
    last = r.end;
  }
  if (last < text.length) {
    segments.push({ type: 'normal', start: last, end: text.length });
  }
  return segments;
}

/**
 * 텍스트에서 주어진 문구들을 배경색으로 하이라이트한 React 노드 반환
 */
export function highlightText(
  text: string,
  highlightPhrases: string[],
  className: string = HIGHLIGHT_CLASS
): React.ReactNode {
  if (!highlightPhrases?.length) return text;
  const segments = getMergedRanges(text, highlightPhrases);
  return (
    <>
      {segments.map((seg, i) => {
        const slice = text.slice(seg.start, seg.end);
        if (seg.type === 'highlight') {
          return (
            <mark key={i} className={className}>
              {slice}
            </mark>
          );
        }
        return <React.Fragment key={i}>{slice}</React.Fragment>;
      })}
    </>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 마크다운 전처리: 원문에 하이라이트 구간을 <mark class="...">로 감싼 문자열 반환.
 * ReactMarkdown + rehype-raw 로 렌더 시 해당 구간이 배경색으로 표시됨.
 */
export function injectHighlightMarkup(
  content: string,
  highlightPhrases: string[],
  markClass: string = HIGHLIGHT_CLASS
): string {
  if (!highlightPhrases?.length) return content;
  const segments = getMergedRanges(content, highlightPhrases);
  return segments
    .map((seg) => {
      const slice = content.slice(seg.start, seg.end);
      if (seg.type === 'highlight') {
        return `<mark class="${markClass.replace(/"/g, '&quot;')}">${escapeHtml(slice)}</mark>`;
      }
      return slice;
    })
    .join('');
}

export { HIGHLIGHT_CLASS };
