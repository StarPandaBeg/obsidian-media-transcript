import { describe, expect, it } from 'vitest';
import { inferVideoMimeType } from '../src/utils/mediaType';

describe('inferVideoMimeType', () => {
  it('recognizes WebM from a remote descriptor with an extensionless signed URL', () => {
    expect(inferVideoMimeType(
      'recording.webm.remote',
      'https://cdn.example.com/download?signature=abc',
    )).toBe('video/webm');
  });

  it('recognizes the .remote.json descriptor spelling', () => {
    expect(inferVideoMimeType(
      'recording.webm.remote.json',
      'https://cdn.example.com/download',
    )).toBe('video/webm');
  });

  it('falls back to the URL path and ignores its query string', () => {
    expect(inferVideoMimeType(
      'recording.remote',
      'https://cdn.example.com/media/recording.webm?token=123',
    )).toBe('video/webm');
  });

  it('returns null when the container cannot be inferred', () => {
    expect(inferVideoMimeType('recording.remote', 'https://cdn.example.com/download')).toBeNull();
  });
});
