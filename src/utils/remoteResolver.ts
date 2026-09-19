import { App, TFile } from 'obsidian';

export const KNOWN_REMOTE_PLUGIN_IDS = [
  'remote-archive',
  'remote',
  'obsidian-remote-archive',
  'obsidian-remote',
];

export interface RemoteArchivePlugin {
  manifest?: { id?: string; name?: string };
  api?: {
    resolve?: (file: TFile) => Promise<{ url?: string }>;
  };
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

export type RemoteResolveResult =
  | { url: string }
  | { error: string };

/**
 * Resolve a remote media descriptor file to a playback URL via the Remote Archive plugin API.
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

