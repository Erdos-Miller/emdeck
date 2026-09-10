export interface SshTarget {
  backend: 'cmux' | 'tmux' | 'shell';
  host: string;
  port: number | null;
  session: string;
  binary: string;
  command: string;
}
export type SshProfile = { id: string; name: string; kind: 'ssh'; target: SshTarget };
export type RemoteProfile =
  | SshProfile
  | { id: string; name: string; kind: 'web'; provider: 'claude' | 'custom'; url: string };
export type TerminalView = 'panes' | 'workspaces' | 'server';
