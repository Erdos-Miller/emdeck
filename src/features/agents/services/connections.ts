import type { RemoteProfile, SshTarget } from '../../../shared/contracts/remote';
import type { Pane } from '../../../shared/contracts/workspace';

const hostPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.@:[\]-]*$/;
const identifier = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/;
const executable = /^[a-zA-Z0-9_/.][a-zA-Z0-9_/.-]*$/;

export const validateSshTarget = (target: SshTarget): string | null => {
  if (!['cmux', 'tmux', 'shell'].includes(target.backend)) return 'Choose a supported SSH mode.';
  if (!hostPattern.test(target.host) || target.host.length > 255)
    return 'Use an SSH host alias or user@hostname, without spaces or SSH options.';
  if (
    target.port !== null &&
    (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535)
  )
    return 'Port must be between 1 and 65535, or blank to use SSH configuration.';
  if (target.backend !== 'shell') {
    if (!identifier.test(target.session) || target.session.length > 100)
      return 'Session names may contain letters, numbers, underscores, dots and hyphens.';
    if (!executable.test(target.binary) || target.binary.length > 512)
      return 'Use a binary name or POSIX path without spaces or shell syntax.';
  }
  if (target.command.length > 8192 || target.command.includes('\0'))
    return 'Remote command is too long or contains a null character.';
  return null;
};

export const validateProfile = (profile: RemoteProfile): string | null => {
  if (!profile.name.trim() || profile.name.length > 100)
    return 'Enter a name of at most 100 characters.';
  if (profile.kind === 'ssh') return validateSshTarget(profile.target);
  try {
    const url = new URL(profile.url);
    if (url.protocol !== 'https:' || url.username || url.password || profile.url.length > 4096)
      return 'Use an HTTPS session URL without embedded credentials.';
    if (
      profile.provider === 'claude' &&
      (url.hostname !== 'claude.ai' || !/^\/code(?:\/|$)/.test(url.pathname))
    )
      return 'Paste a Claude Remote Control link from claude.ai/code.';
  } catch {
    return 'Enter a valid HTTPS session URL.';
  }
  return null;
};

export const restoreProfiles = (value: unknown): RemoteProfile[] => {
  if (!Array.isArray(value)) return [];
  const profiles: RemoteProfile[] = [];
  for (const item of value.slice(0, 50)) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.id !== 'string' ||
      typeof item.name !== 'string' ||
      !identifier.test(item.id)
    )
      continue;
    let profile: RemoteProfile;
    if (item.kind === 'ssh') {
      const t = item.target;
      if (
        !t ||
        typeof t !== 'object' ||
        !['backend', 'host', 'session', 'binary', 'command'].every(
          key => typeof t[key] === 'string'
        )
      )
        continue;
      profile = {
        id: item.id,
        name: item.name,
        kind: 'ssh',
        target: {
          backend: t.backend,
          host: t.host,
          session: t.session,
          binary: t.binary,
          command: t.command,
          port: t.port,
        },
      };
    } else if (
      item.kind === 'web' &&
      ['claude', 'custom'].includes(item.provider) &&
      typeof item.url === 'string'
    ) {
      profile = {
        id: item.id,
        name: item.name,
        kind: 'web',
        provider: item.provider,
        url: item.url,
      };
    } else continue;
    if (!validateProfile(profile) && !profiles.some(p => p.id === profile.id))
      profiles.push(profile);
  }
  return profiles;
};

export const spaceId = (pane: Pane) =>
  pane.remote ? `remote:${pane.remote.id}` : `local:${pane.cwd}`;
export const terminalSpaces = (panes: Pane[], projectName: string) => {
  const groups = new Map<
    string,
    { id: string; name: string; detail: string; remote: boolean; panes: Pane[] }
  >();
  for (const pane of panes) {
    const id = spaceId(pane);
    if (!groups.has(id))
      groups.set(id, {
        id,
        name: pane.remote?.name ?? (pane.cwd || projectName),
        detail: pane.remote?.target.host ?? (pane.cwd ? `./${pane.cwd}` : 'Project root'),
        remote: !!pane.remote,
        panes: [],
      });
    groups.get(id)!.panes.push(pane);
  }
  return [...groups.values()];
};

export const remoteStatus = (state?: string) =>
  state === 'exited' || state === 'error'
    ? 'Disconnected'
    : state === 'starting'
      ? 'Starting SSH'
      : state === 'preview'
        ? 'Desktop only'
        : 'SSH client running';
