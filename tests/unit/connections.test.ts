import { describe, expect, it } from 'vitest';
import {
  restoreProfiles,
  terminalSpaces,
  validateProfile,
} from '../../src/features/agents/services/connections';
import type { RemoteProfile, SshProfile } from '../../src/shared/contracts/remote';
import type { Pane } from '../../src/shared/contracts/workspace';
const profile: SshProfile = {
  id: 'buildbox',
  name: 'Build box',
  kind: 'ssh',
  target: {
    backend: 'cmux',
    host: 'dev@buildbox',
    port: null,
    session: 'agents',
    binary: 'cmux',
    command: '',
  },
};

describe('remote connection configuration', () => {
  it('accepts SSH config aliases, explicit ports, and multiplexer paths', () => {
    expect(validateProfile(profile)).toBeNull();
    expect(
      validateProfile({
        ...profile,
        target: {
          ...profile.target,
          host: 'dev@[2001:db8::1]',
          binary: '/opt/homebrew/bin/cmux',
          port: 2222,
        },
      })
    ).toBeNull();
  });
  it('rejects option injection and shell syntax in host and attachment identifiers', () => {
    for (const key of ['host', 'session', 'binary']) {
      for (const value of ['-oProxyCommand=x', 'a;echo bad', 'a b', 'a\nb', '$(whoami)', 'a"']) {
        expect(
          validateProfile({ ...profile, target: { ...profile.target, [key]: value } }),
          `${key}: ${value}`
        ).not.toBeNull();
      }
    }
    for (const port of [0, -1, 65536, 2.5, NaN])
      expect(validateProfile({ ...profile, target: { ...profile.target, port } })).not.toBeNull();
  });
  it('distinguishes explicit remote commands from attachment configuration', () => {
    expect(
      validateProfile({
        ...profile,
        target: {
          ...profile.target,
          backend: 'shell',
          session: '',
          binary: '',
          command: "cd '/workspace with spaces' && codex resume",
        },
      })
    ).toBeNull();
    expect(
      validateProfile({ ...profile, target: { ...profile.target, command: '\0' } })
    ).not.toBeNull();
  });
  it('validates provider URLs without allowing deceptive Claude domains or credentials', () => {
    const web: RemoteProfile = {
      id: 'claude',
      name: 'Claude',
      kind: 'web',
      provider: 'claude',
      url: 'https://claude.ai/code/session_example',
    };
    expect(validateProfile(web)).toBeNull();
    for (const url of [
      'http://claude.ai/code',
      'https://claude.ai.example/code',
      'https://user:pass@claude.ai/code',
      'javascript:alert(1)',
      'https://claude.ai/settings',
    ])
      expect(validateProfile({ ...web, url })).not.toBeNull();
    expect(
      validateProfile({ ...web, provider: 'custom', url: 'https://chatgpt.com/codex' })
    ).toBeNull();
  });
  it('restores only valid unique profiles and drops unknown credential fields', () => {
    const saved = {
      ...profile,
      password: 'must-not-restore',
      target: { ...profile.target, privateKey: 'must-not-restore' },
    };
    expect(
      restoreProfiles([null, {}, saved, profile, { ...profile, id: 'bad', target: null }])
    ).toEqual([profile]);
    expect(restoreProfiles('corrupt')).toEqual([]);
    expect(
      restoreProfiles([{ ...profile, target: { ...profile.target, port: undefined } }])
    ).toEqual([]);
  });
  it('groups local working folders separately from remote hosts with the same display name', () => {
    const pane: Pane = {
      id: 'local',
      name: 'Claude',
      cwd: '',
      command: 'claude',
      shell: '',
      color: '#abc',
    };
    const other = { ...pane, id: 'tools', cwd: 'tools' };
    const remote = { ...pane, id: 'remote', remote: profile };
    const groups = terminalSpaces([pane, other, remote], 'Build box');
    expect(groups.map(g => g.id)).toEqual(['local:', 'local:tools', 'remote:buildbox']);
    expect(groups[2].panes).toEqual([remote]);
    expect(groups[0].remote).toBe(false);
    expect(pane).not.toHaveProperty('remote');
  });
});
