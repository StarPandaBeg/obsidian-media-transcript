import { describe, it, expect, vi } from 'vitest';
import {
  resolveRemoteMediaUrl,
  getRemotePlugin,
  isRemotePreviewEnabled,
  KNOWN_REMOTE_PLUGIN_IDS,
} from '../src/utils/remoteResolver';
import type { App, TFile } from 'obsidian';

function mockFile(name: string): TFile {
  return { name, path: `folder/${name}` } as TFile;
}

describe('getRemotePlugin', () => {
  it('returns null when app has no plugins object', () => {
    const app = {} as App;
    expect(getRemotePlugin(app)).toBeNull();
  });

  it('returns plugin via getPlugin method with known ID', () => {
    const pluginInstance = { api: { resolve: vi.fn() } };
    const app = {
      plugins: {
        getPlugin: vi.fn((id: string) => id === KNOWN_REMOTE_PLUGIN_IDS[0] ? pluginInstance : null),
      },
    } as unknown as App;
    expect(getRemotePlugin(app)).toBe(pluginInstance);
  });

  it('returns plugin via plugins dictionary fallback', () => {
    const pluginInstance = { api: { resolve: vi.fn() } };
    const app = {
      plugins: {
        plugins: {
          [KNOWN_REMOTE_PLUGIN_IDS[0]]: pluginInstance,
        },
      },
    } as unknown as App;
    expect(getRemotePlugin(app)).toBe(pluginInstance);
  });

  it('returns plugin via dynamic scan if ID is custom but provides api.resolve', () => {
    const customPlugin = {
      manifest: { id: 'custom-remote-plugin' },
      api: { resolve: vi.fn() },
    };
    const app = {
      plugins: {
        plugins: {
          'some-other-plugin': { api: {} },
          'custom-remote-plugin': customPlugin,
        },
      },
    } as unknown as App;
    expect(getRemotePlugin(app)).toBe(customPlugin);
  });
});

describe('resolveRemoteMediaUrl', () => {
  it('fails when Remote plugin is not installed/enabled', async () => {
    const app = { plugins: { getPlugin: () => null } } as unknown as App;
    const file = mockFile('video.mp4.remote');
    const result = await resolveRemoteMediaUrl(app, file);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('not installed');
    }
  });

  it('fails when api.resolve is missing on plugin', async () => {
    const app = {
      plugins: {
        getPlugin: () => ({ api: {} }),
      },
    } as unknown as App;
    const file = mockFile('video.mp4.remote');
    const result = await resolveRemoteMediaUrl(app, file);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('api.resolve');
    }
  });

  it('fails when api.resolve throws an error', async () => {
    const app = {
      plugins: {
        getPlugin: () => ({
          api: {
            resolve: vi.fn().mockRejectedValue(new Error('Network offline')),
          },
        }),
      },
    } as unknown as App;
    const file = mockFile('video.mp4.remote');
    const result = await resolveRemoteMediaUrl(app, file);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Network offline');
    }
  });

  it('fails when api.resolve returns no url or empty url', async () => {
    const app = {
      plugins: {
        getPlugin: () => ({
          api: {
            resolve: vi.fn().mockResolvedValue({ url: '   ' }),
          },
        }),
      },
    } as unknown as App;
    const file = mockFile('video.mp4.remote');
    const result = await resolveRemoteMediaUrl(app, file);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('could not resolve a URL');
    }
  });

  it('returns trimmed url when api.resolve succeeds', async () => {
    const remoteFile = mockFile('video.mp4.remote');
    const app = {
      plugins: {
        getPlugin: () => ({
          api: {
            resolve: vi.fn().mockResolvedValue({ url: ' https://cdn.example.com/video.mp4 ' }),
          },
        }),
      },
    } as unknown as App;
    const result = await resolveRemoteMediaUrl(app, remoteFile);
    expect('url' in result).toBe(true);
    if ('url' in result) {
      expect(result.url).toBe('https://cdn.example.com/video.mp4');
    }
  });

  it('fails with previewDisabled when isPreviewEnabled() returns false', async () => {
    const remoteFile = mockFile('video.mp4.remote');
    const app = {
      plugins: {
        getPlugin: () => ({
          manifest: { name: 'WebDAV Archive' },
          api: {
            isPreviewEnabled: vi.fn().mockReturnValue(false),
            resolve: vi.fn(),
          },
        }),
      },
    } as unknown as App;
    const result = await resolveRemoteMediaUrl(app, remoteFile);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.previewDisabled).toBe(true);
      expect(result.error).toContain('disabled');
      expect(result.error).toContain('WebDAV Archive');
    }
  });

  it('succeeds when isPreviewEnabled() returns true', async () => {
    const remoteFile = mockFile('video.mp4.remote');
    const app = {
      plugins: {
        getPlugin: () => ({
          manifest: { name: 'WebDAV Archive' },
          api: {
            isPreviewEnabled: vi.fn().mockReturnValue(true),
            resolve: vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/video.mp4' }),
          },
        }),
      },
    } as unknown as App;
    const result = await resolveRemoteMediaUrl(app, remoteFile);
    expect('url' in result).toBe(true);
    if ('url' in result) {
      expect(result.url).toBe('https://cdn.example.com/video.mp4');
    }
  });
});

describe('isRemotePreviewEnabled', () => {
  it('returns false when Remote plugin is missing', () => {
    const app = { plugins: { getPlugin: () => null } } as unknown as App;
    expect(isRemotePreviewEnabled(app)).toBe(false);
  });

  it('returns true when isPreviewEnabled is not defined (backward compatibility)', () => {
    const app = {
      plugins: {
        getPlugin: () => ({ api: { resolve: vi.fn() } }),
      },
    } as unknown as App;
    expect(isRemotePreviewEnabled(app)).toBe(true);
  });

  it('returns true when isPreviewEnabled() returns true', () => {
    const app = {
      plugins: {
        getPlugin: () => ({ api: { isPreviewEnabled: () => true } }),
      },
    } as unknown as App;
    expect(isRemotePreviewEnabled(app)).toBe(true);
  });

  it('returns false when isPreviewEnabled() returns false', () => {
    const app = {
      plugins: {
        getPlugin: () => ({ api: { isPreviewEnabled: () => false } }),
      },
    } as unknown as App;
    expect(isRemotePreviewEnabled(app)).toBe(false);
  });
});
