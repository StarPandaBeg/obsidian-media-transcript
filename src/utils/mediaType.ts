const VIDEO_MIME_TYPES: Record<string, string> = {
  webm: 'video/webm',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
};

function extensionFromName(name: string): string | null {
  const plain = name.toLowerCase().replace(/\.remote(?:\.json)?$/, '');
  const dot = plain.lastIndexOf('.');
  return dot >= 0 ? plain.slice(dot + 1) : null;
}

/**
 * Infer a video MIME type from a media/descriptor filename first, then URL.
 * Signed remote URLs commonly have no useful extension, so the descriptor is
 * the authoritative source for names such as `recording.webm.remote`.
 */
export function inferVideoMimeType(fileName: string, url: string): string | null {
  const fileExtension = extensionFromName(fileName);
  if (fileExtension && VIDEO_MIME_TYPES[fileExtension]) {
    return VIDEO_MIME_TYPES[fileExtension];
  }

  try {
    const urlExtension = extensionFromName(decodeURIComponent(new URL(url).pathname));
    return urlExtension ? VIDEO_MIME_TYPES[urlExtension] ?? null : null;
  } catch {
    return null;
  }
}
