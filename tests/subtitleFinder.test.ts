import { describe, expect, it } from 'vitest';
import {
  findRemoteDescriptorForMedia,
  findRemoteDescriptorForSubtitle,
  remoteDescriptorBaseName,
  findSubtitleFiles,
  resolvePriority,
  type FoundSubtitleFile,
} from '../src/utils/subtitleFinder';
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

const file = (name: string, dir = 'media') => {
  const dot = name.lastIndexOf('.');
  return {
    name,
    path: `${dir}/${name}`,
    basename: name.slice(0, dot),
    extension: name.slice(dot + 1),
    parent: { path: dir },
  } as never;
};

const vaultWith = (...files: ReturnType<typeof file>[]) => ({ getFiles: () => files }) as never;

describe('remote media descriptors', () => {
  it('finds the descriptor next to a local media file', () => {
    const media = file('lecture.mp4');
    const remote = file('lecture.remote');
    expect(findRemoteDescriptorForMedia(media, vaultWith(media, remote))).toBe(remote);
  });

  it('finds a descriptor from a marked transcript without local media', () => {
    const transcript = file('lecture.whisper.json');
    const remote = file('lecture.remote.json');
    expect(findRemoteDescriptorForSubtitle(transcript, vaultWith(transcript, remote))).toBe(remote);
  });

  it('prefers .remote when both descriptor spellings exist', () => {
    const media = file('lecture.mp4');
    const remote = file('lecture.remote');
    const remoteJson = file('lecture.remote.json');
    expect(findRemoteDescriptorForMedia(media, vaultWith(remoteJson, remote))).toBe(remote);
  });

  it('does not include the descriptor among subtitle tracks', () => {
    const media = file('lecture.mp4');
    const transcript = file('lecture.whisper.json');
    const remote = file('lecture.remote.json');
    const settings = {
      subtitleDirectory: '',
      supportedVideoExtensions: ['mp4'],
      supportedAudioExtensions: [],
    } as never;
    const found = findSubtitleFiles(media, vaultWith(media, transcript, remote), settings);
    expect(found.map(track => track.file.name)).toEqual(['lecture.whisper.json']);
  });

  it('finds video.mp4.remote when transcript is video.json', () => {
    const transcript = file('video.json');
    const remote = file('video.mp4.remote');
    expect(findRemoteDescriptorForSubtitle(transcript, vaultWith(transcript, remote))).toBe(remote);
  });

  it('finds video.mp4.remote.json when transcript is video.json', () => {
    const transcript = file('video.json');
    const remote = file('video.mp4.remote.json');
    expect(findRemoteDescriptorForSubtitle(transcript, vaultWith(transcript, remote))).toBe(remote);
  });

  it('finds video.mp4.remote when transcript is video.mp4.json', () => {
    const transcript = file('video.mp4.json');
    const remote = file('video.mp4.remote');
    expect(findRemoteDescriptorForSubtitle(transcript, vaultWith(transcript, remote))).toBe(remote);
  });

  it('finds video.mp4.remote when transcript is video.whisper.json', () => {
    const transcript = file('video.whisper.json');
    const remote = file('video.mp4.remote');
    expect(findRemoteDescriptorForSubtitle(transcript, vaultWith(transcript, remote))).toBe(remote);
  });

  it('finds video.mp4.remote next to local media video.mp4', () => {
    const media = file('video.mp4');
    const remote = file('video.mp4.remote');
    expect(findRemoteDescriptorForMedia(media, vaultWith(media, remote))).toBe(remote);
  });

  it('prefers video descriptor over audio descriptor for video.json', () => {
    const transcript = file('video.json');
    const audioRemote = file('video.mp3.remote');
    const videoRemote = file('video.mp4.remote');
    expect(
      findRemoteDescriptorForSubtitle(
        transcript,
        vaultWith(transcript, audioRemote, videoRemote),
      ),
    ).toBe(videoRemote);
  });

  it('returns null when enableRemoteMedia is disabled in settings for subtitle search', () => {
    const transcript = file('video.json');
    const remote = file('video.mp4.remote');
    const settings = {
      enableRemoteMedia: false,
      supportedVideoExtensions: ['mp4'],
      supportedAudioExtensions: [],
    } as never;
    expect(findRemoteDescriptorForSubtitle(transcript, vaultWith(transcript, remote), settings)).toBeNull();
  });

  it('returns null when enableRemoteMedia is disabled in settings for media search', () => {
    const media = file('video.mp4');
    const remote = file('video.mp4.remote');
    const settings = {
      enableRemoteMedia: false,
    } as never;
    expect(findRemoteDescriptorForMedia(media, vaultWith(media, remote), settings)).toBeNull();
  });
});

describe('remoteDescriptorBaseName', () => {
  it('extracts base name from video.mp4.remote', () => {
    expect(remoteDescriptorBaseName(file('video.mp4.remote'))).toBe('video');
  });

  it('extracts base name from video.mp4.remote.json', () => {
    expect(remoteDescriptorBaseName(file('video.mp4.remote.json'))).toBe('video');
  });

  it('extracts base name from video.remote', () => {
    expect(remoteDescriptorBaseName(file('video.remote'))).toBe('video');
  });

  it('extracts base name from video.remote.json', () => {
    expect(remoteDescriptorBaseName(file('video.remote.json'))).toBe('video');
  });
});
