import { describe, it, expect } from 'vitest';
import {
  parseJSON,
  parseSRT,
  parseVTT,
  parseSubtitle,
  parsepublicUrl,
} from '../src/utils/subtitleParser';

describe('parseJSON', () => {
  it('reads the Whisper / local-asr shape', () => {
    const segs = parseJSON(JSON.stringify({
      segments: [{ start: 0, end: 2.5, text: '你好', speaker: 0 }],
    }));
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ startTime: 0, endTime: 2.5, text: '你好', speaker: 0 });
  });

  it('reads a bare array of segments', () => {
    const segs = parseJSON(JSON.stringify([{ start: 1, end: 2, text: 'hi' }]));
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('hi');
  });

  it('accepts the startTime / endTime / content spellings', () => {
    const segs = parseJSON(JSON.stringify([{ startTime: 3, endTime: 4, content: 'yo' }]));
    expect(segs[0]).toMatchObject({ startTime: 3, endTime: 4, text: 'yo' });
  });

  // Everything below is why this file exists: `.json` is registered wholesale,
  // so the parser is handed all sorts of things that were never subtitles, and
  // "did it parse" doubles as "is this a subtitle" in the empty-state message.
  it('finds nothing in JSON that was never a subtitle', () => {
    expect(parseJSON(JSON.stringify({ hello: 1 }))).toEqual([]);
    expect(parseJSON('[]')).toEqual([]);
    expect(parseJSON('not json at all')).toEqual([]);
  });

  it('finds nothing in an annotation sidecar', () => {
    // Attention writes these next to notes and media; they must not read as
    // subtitle tracks.
    expect(parseJSON(JSON.stringify({
      version: 1, target: 'a.md',
      annotations: [{ id: 'x', anchor: { quote: 'q' }, hits: ['2026-01-01'] }],
    }))).toEqual([]);
  });

  it('rejects an array of objects that carry no text', () => {
    // These used to become segments with empty text and a zero time range:
    // blank clickable rows in the transcript, and a file wrongly reported as a
    // subtitle whose media is missing.
    expect(parseJSON(JSON.stringify([{ hello: 1 }, { world: 2 }]))).toEqual([]);
  });

  it('drops empty entries but keeps the real ones around them', () => {
    const segs = parseJSON(JSON.stringify({
      segments: [
        { start: 0, end: 1, text: 'first' },
        { start: 1, end: 2, text: '   ' },
        { start: 2, end: 3, text: 'third' },
      ],
    }));
    expect(segs.map(s => s.text)).toEqual(['first', 'third']);
  });

  it('numbers segments consecutively after dropping empties', () => {
    const segs = parseJSON(JSON.stringify([
      { start: 0, end: 1, text: '' },
      { start: 1, end: 2, text: 'kept' },
    ]));
    expect(segs).toHaveLength(1);
    expect(segs[0].index).toBe(1);
  });
});

describe('parsepublicUrl', () => {
  it('reads and trims publicUrl from a remote descriptor', () => {
    expect(parsepublicUrl(JSON.stringify({
      publicUrl: ' https://cdn.example.com/talk.mp4 ',
      originalName: 'talk.mp4',
    }))).toBe('https://cdn.example.com/talk.mp4');
  });

  it('ignores missing, empty, or non-string values', () => {
    expect(parsepublicUrl('{}')).toBeNull();
    expect(parsepublicUrl('{"publicUrl":"   "}')).toBeNull();
    expect(parsepublicUrl('{"publicUrl":42}')).toBeNull();
    expect(parsepublicUrl('not json')).toBeNull();
  });
});

describe('parseSRT', () => {
  it('reads blocks and millisecond timings', () => {
    const segs = parseSRT('1\n00:00:05,022 --> 00:00:07,012\n那个\n\n2\n00:00:07,012 --> 00:00:10,000\nsecond');
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ startTime: 5.022, endTime: 7.012, text: '那个' });
  });

  it('strips inline markup some files carry', () => {
    const segs = parseSRT('1\n00:00:00,000 --> 00:00:01,000\n<i>tilted</i>');
    expect(segs[0].text).toBe('tilted');
  });

  it('ignores blocks that are not subtitle blocks', () => {
    expect(parseSRT('just some prose\n\nand more prose')).toEqual([]);
  });
});

describe('parseVTT', () => {
  it('skips the header and reads cues', () => {
    const segs = parseVTT('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello');
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ startTime: 1, endTime: 2, text: 'hello' });
  });

  it('reads MM:SS timings as well as HH:MM:SS', () => {
    const segs = parseVTT('WEBVTT\n\n01:30.500 --> 01:32.000\nlate');
    expect(segs[0].startTime).toBeCloseTo(90.5);
  });
});

describe('parseSubtitle dispatch', () => {
  it('routes by extension and shrugs at unknown ones', () => {
    expect(parseSubtitle('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nx', 'vtt')).toHaveLength(1);
    expect(parseSubtitle('{"segments":[{"start":0,"end":1,"text":"x"}]}', 'JSON')).toHaveLength(1);
    expect(parseSubtitle('anything', 'txt')).toEqual([]);
  });
});

// Coercing whatever turned up made a nested object into the literal
// "[object Object]" and passed it off as a subtitle line — worse than failing
// to read the file, because it looks like it worked.
describe('entries whose text is not text', () => {
  it('ignores an object where the text should be', () => {
    expect(parseJSON(JSON.stringify([{ start: 0, end: 1, text: { zh: '你好' } }]))).toEqual([]);
  });

  it('ignores an array, a boolean and a null', () => {
    const raw = JSON.stringify([
      { start: 0, end: 1, text: ['a', 'b'] },
      { start: 1, end: 2, text: true },
      { start: 2, end: 3, text: null },
    ]);
    expect(parseJSON(raw)).toEqual([]);
  });

  it('still reads a number, which is text a speaker said', () => {
    const [only] = parseJSON(JSON.stringify([{ start: 0, end: 1, text: 2023 }]));
    expect(only.text).toBe('2023');
  });

  it('falls through to content when text is not usable', () => {
    const [only] = parseJSON(JSON.stringify([{ start: 0, end: 1, text: {}, content: '有内容' }]));
    expect(only.text).toBe('有内容');
  });
});
