import { App, TFile } from 'obsidian';

export const KNOWN_REMOTE_PLUGIN_IDS = [
  'webdav-archive',
  'remote-archive',
  'remote',
  'obsidian-webdav-archive',
  'obsidian-remote-archive',
  'obsidian-remote',
];

export interface WebDavArchiveApi {
  resolve(remoteFile: TFile): Promise<{ url: string }>;
  isPreviewEnabled(): boolean;
}

export interface RemoteArchivePlugin {
  manifest?: { id?: string; name?: string };
  api?: WebDavArchiveApi;
}

/**
 * Dynamically look up the Remote plugin from Obsidian's plugin registry.
 * Avoids any compile-time / npm dependency on the remote plugin.
 */
export function getRemotePlugin(app: App): RemoteArchivePlugin | null {
  const plugins = (app as unknown as {
    plugins?: {
      getPlugin?: (id: string) => unknown;
      plugins?: Record<string, unknown>;
    };
  }).plugins;
  if (!plugins) return null;

  for (const id of KNOWN_REMOTE_PLUGIN_IDS) {
    const instance = plugins.getPlugin?.(id) ?? plugins.plugins?.[id];
    if (instance) return instance as RemoteArchivePlugin;
  }

  // Fallback: search any active plugin that exposes api.resolve
  if (plugins.plugins) {
    for (const plugin of Object.values(plugins.plugins)) {
      const maybe = plugin as RemoteArchivePlugin | undefined;
      if (maybe?.api && typeof maybe.api.resolve === 'function') {
        return maybe;
      }
    }
  }

  return null;
}

/**
 * Check whether remote media preview is enabled in the Remote plugin.
 * Returns false if the plugin is not installed or enabled, or if isPreviewEnabled() returns false.
 * Returns true if the plugin is present and isPreviewEnabled is not implemented (backwards compatibility).
 */
export function isRemotePreviewEnabled(app: App): boolean {
  const remotePlugin = getRemotePlugin(app);
  if (!remotePlugin?.api) return false;
  if (typeof remotePlugin.api.isPreviewEnabled === 'function') {
    try {
      return Boolean(remotePlugin.api.isPreviewEnabled());
    } catch {
      return false;
    }
  }
  return true;
}

export type RemoteResolveResult =
  | { url: string }
  | { error: string; previewDisabled?: boolean };

/**
 * Resolve a remote media descriptor file to a playback URL via the Remote plugin API.
 */
export async function resolveRemoteMediaUrl(
  app: App,
  remoteFile: TFile,
): Promise<RemoteResolveResult> {
  const remotePlugin = getRemotePlugin(app);
  if (!remotePlugin) {
    return {
      error: 'Remote plugin is not installed or enabled. Please install and enable the Remote plugin.',
    };
  }
  if (!remotePlugin.api || typeof remotePlugin.api.resolve !== 'function') {
    const name = remotePlugin.manifest?.name ?? remotePlugin.manifest?.id ?? 'Remote';
    return {
      error: `Remote plugin "${name}" does not provide the required api.resolve method.`,
    };
  }

  if (typeof remotePlugin.api.isPreviewEnabled === 'function') {
    try {
      if (!remotePlugin.api.isPreviewEnabled()) {
        const name = remotePlugin.manifest?.name ?? remotePlugin.manifest?.id ?? 'Remote';
        return {
          error: `Remote media preview is disabled in "${name}" plugin settings.`,
          previewDisabled: true,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        error: `Failed to check remote media preview availability: ${message}`,
      };
    }
  }

  try {
    const result = await remotePlugin.api.resolve(remoteFile);
    const url = result?.url;
    if (typeof url === 'string' && url.trim().length > 0) {
      return { url: url.trim() };
    }
    return {
      error: `Remote plugin could not resolve a URL for "${remoteFile.name}".`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      error: `Failed to resolve remote media for "${remoteFile.name}": ${message}`,
    };
  }
}
