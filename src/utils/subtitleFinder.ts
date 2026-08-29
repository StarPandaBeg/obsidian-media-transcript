import { TFile, Vault } from 'obsidian';
import type { MediaTranscriptSettings, SubtitlePriority } from '../settings';

export interface FoundSubtitleFile {
  file: TFile;
  marker: string;    // the [xx] part — empty string means no marker (e.g. "video.srt")
  extension: string; // "srt" | "vtt" | "json"
}

export const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'json'];

// Escape special regex characters in a string
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find all subtitle files that correspond to the given media file.
 *
 * Naming convention:
 *   [baseName].[ext]          → marker = ""
 *   [baseName].[marker].[ext] → marker = the middle part
 *
 * Search directory: settings.subtitleDirectory if set, otherwise the media file's own folder.
 */
export function findSubtitleFiles(
  mediaFile: TFile,
  vault: Vault,
  settings: MediaTranscriptSettings,
): FoundSubtitleFile[] {
  const baseName = mediaFile.basename; // filename without extension
  const mediaDir = mediaFile.parent?.path ?? '';
  const searchDir = settings.subtitleDirectory.trim() || mediaDir;

  // Regex matches both:
  //   "video.srt"          → group 1 = undefined
  //   "video.whisper.srt"  → group 1 = "whisper"
  const pattern = new RegExp(
    `^${escapeRegex(baseName)}(?:\\.([^.]+))?\\.(?:${SUBTITLE_EXTENSIONS.join('|')})$`,
  );

  const results: FoundSubtitleFile[] = [];

  for (const file of vault.getFiles()) {
    const dir = file.parent?.path ?? '';
    if (dir !== searchDir) continue;

    const match = file.name.match(pattern);
    if (!match) continue;

    const ext = file.extension.toLowerCase();
    if (!SUBTITLE_EXTENSIONS.includes(ext)) continue;

    const marker = match[1] ?? '';
    results.push({ file, marker, extension: ext });
  }

  return results;
}

/**
 * Sort a media file's subtitle files into the order they should be preferred.
 *
 * The first entry is what opens by default, so this decides which
 * transcription a recording is normally read through.
 *
 * Priority entries name the `[marker]` part of the filename, best first, with
 * the empty marker standing for the plain `video.srt` form. A marker the list
 * does not mention ranks after every one it does: an unlisted track is not
 * rejected, it is simply not what was asked for.
 *
 * Ties break on format — SRT, then VTT, then JSON — because that is the order
 * they carry the least machinery for the same words. Anything still tied keeps
 * the order it was found in, so the result is stable from one open to the next.
 */
const FORMAT_ORDER = ['srt', 'vtt', 'json'];

export function resolvePriority(
  found: FoundSubtitleFile[],
  priorities: SubtitlePriority[],
): FoundSubtitleFile[] {
  const rankOf = new Map(priorities.map((p, i) => [p.marker.trim(), i]));
  const rank = (f: FoundSubtitleFile) => rankOf.get(f.marker.trim()) ?? priorities.length;
  const format = (f: FoundSubtitleFile) => {
    const at = FORMAT_ORDER.indexOf(f.extension.toLowerCase());
    return at < 0 ? FORMAT_ORDER.length : at;
  };

  return found
    .map((file, found_at) => ({ file, found_at }))
    .sort((a, b) =>
      rank(a.file) - rank(b.file) ||
      format(a.file) - format(b.file) ||
      a.found_at - b.found_at)
    .map(entry => entry.file);
}

/**
 * Reverse lookup: given a subtitle file, find the media file it belongs to.
 *
 * This mirrors the naming convention used by findSubtitleFiles, but backwards:
 *   [baseName].[ext]          (subtitle) → media basename = baseName
 *   [baseName].[marker].[ext] (subtitle) → media basename = baseName
 * Since the [marker] is arbitrary, we try every prefix of the subtitle's
 * name as a candidate media basename (longest first), e.g.
 *   "lecture.whisper.json" → candidates: "lecture.whisper", "lecture".
 *
 * Search directory: the subtitle file's own folder (media normally sits next
 * to its subtitles).
 *
 * Preference: video before audio, then by the extension order configured in
 * settings — so an .mp4 wins over an .m4a for the same basename.
 * Returns null if no matching media file exists.
 */
export function findMediaForSubtitle(
  subtitleFile: TFile,
  vault: Vault,
  settings: MediaTranscriptSettings,
): TFile | null {
  const dir = subtitleFile.parent?.path ?? '';

  // Strip the subtitle extension, then build candidate media basenames from
  // every dotted prefix (so an arbitrary [marker] segment is peeled off).
  const withoutExt = subtitleFile.name.slice(
    0,
    subtitleFile.name.length - subtitleFile.extension.length - 1,
  );
  const parts = withoutExt.split('.');
  const candidates = new Set<string>();
  for (let k = parts.length; k >= 1; k--) {
    candidates.add(parts.slice(0, k).join('.'));
  }

  const videoExts = settings.supportedVideoExtensions.map(e => e.toLowerCase());
  const audioExts = settings.supportedAudioExtensions.map(e => e.toLowerCase());

  // Lower rank = higher preference: all video (in configured order) before any audio.
  const rank = (ext: string): number => {
    const vi = videoExts.indexOf(ext);
    if (vi >= 0) return vi;
    const ai = audioExts.indexOf(ext);
    return ai >= 0 ? videoExts.length + ai : Number.MAX_SAFE_INTEGER;
  };

  let best: TFile | null = null;
  let bestRank = Number.MAX_SAFE_INTEGER;

  for (const file of vault.getFiles()) {
    if ((file.parent?.path ?? '') !== dir) continue;
    if (!candidates.has(file.basename)) continue;

    const ext = file.extension.toLowerCase();
    if (!videoExts.includes(ext) && !audioExts.includes(ext)) continue;

    const r = rank(ext);
    if (r < bestRank) {
      best = file;
      bestRank = r;
    }
  }

  return best;
}

/**
 * Find matching markdown note files for the given media file.
 * Same naming convention: [baseName].[marker].md or [baseName].md
 */
export function findMarkdownFiles(
  mediaFile: TFile,
  vault: Vault,
  settings: MediaTranscriptSettings,
): Array<{ file: TFile; marker: string }> {
  const baseName = mediaFile.basename;
  const mediaDir = mediaFile.parent?.path ?? '';
  const searchDir = settings.subtitleDirectory.trim() || mediaDir;

  const pattern = new RegExp(
    `^${escapeRegex(baseName)}(?:\\.([^.]+))?\\.md$`,
  );

  const results: Array<{ file: TFile; marker: string }> = [];

  for (const file of vault.getFiles()) {
    const dir = file.parent?.path ?? '';
    if (dir !== searchDir) continue;
    if (file.extension !== 'md') continue;

    const match = file.name.match(pattern);
    if (!match) continue;

    results.push({ file, marker: match[1] ?? '' });
  }

  return results;
}
