import { describe, expect, it } from 'vitest';
import { resolvePriority, type FoundSubtitleFile } from '../src/utils/subtitleFinder';
import type { SubtitlePriority } from '../src/settings';

const track = (marker: string, extension: string): FoundSubtitleFile =>
  ({ file: { path: `talk${marker ? '.' + marker : ''}.${extension}` } as never, marker, extension });

const prefer = (...markers: string[]): SubtitlePriority[] =>
  markers.map(m => ({ marker: m, label: m || 'Default' }));

const order = (found: FoundSubtitleFile[], p: SubtitlePriority[]) =>
  resolvePriority(found, p).map(f => f.marker + '.' + f.extension);

describe('resolvePriority', () => {
  it('puts the listed marker first', () => {
    const found = [track('whisper', 'json'), track('', 'srt')];
    expect(order(found, prefer('whisper'))[0]).toBe('whisper.json');
  });

  // The empty marker is the plain `talk.srt` form, and is a real choice — it
  // is what this vault actually prefers.
  it('understands the empty marker as a preference of its own', () => {
    const found = [track('whisper', 'json'), track('', 'srt')];
    expect(order(found, prefer(''))[0]).toBe('.srt');
  });

  it('follows the order the list is written in', () => {
    const found = [track('b', 'srt'), track('a', 'srt'), track('c', 'srt')];
    expect(order(found, prefer('c', 'a', 'b'))).toEqual(['c.srt', 'a.srt', 'b.srt']);
  });

  // Unlisted is not rejected, only unasked for.
  it('ranks an unlisted marker after every listed one', () => {
    const found = [track('other', 'srt'), track('whisper', 'json')];
    expect(order(found, prefer('whisper'))).toEqual(['whisper.json', 'other.srt']);
  });

  it('prefers srt, then vtt, then json at the same rank', () => {
    const found = [track('x', 'json'), track('x', 'vtt'), track('x', 'srt')];
    expect(order(found, prefer('x'))).toEqual(['x.srt', 'x.vtt', 'x.json']);
  });

  it('keeps whatever order it was given when nothing else separates them', () => {
    const found = [track('p', 'srt'), track('q', 'srt')];
    expect(order(found, [])).toEqual(['p.srt', 'q.srt']);
  });

  it('ignores stray whitespace in the configured markers', () => {
    const found = [track('', 'srt'), track('whisper', 'srt')];
    expect(order(found, prefer(' whisper '))[0]).toBe('whisper.srt');
  });

  it('has nothing to do for a recording with no subtitles', () => {
    expect(resolvePriority([], prefer('whisper'))).toEqual([]);
  });
});
