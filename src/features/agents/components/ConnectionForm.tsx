import { useState } from 'react';
import type { RemoteProfile } from '../../../shared/contracts/remote';
import { validateProfile } from '../services/connections';

interface Props {
  profile: RemoteProfile | null;
  onSave: (profile: RemoteProfile) => void;
  onCancel: () => void;
}
export default function ConnectionForm({ profile, onSave, onCancel }: Props) {
  const [mode, setMode] = useState(
    profile?.kind === 'ssh'
      ? profile.target.backend
      : profile?.kind === 'web'
        ? profile.provider === 'claude'
          ? 'claude'
          : 'web'
        : 'cmux'
  );
  const [error, setError] = useState('');
  const ssh = profile?.kind === 'ssh' ? profile.target : null;
  const isWeb = mode === 'claude' || mode === 'web';
  const handleModeChange: React.ChangeEventHandler<HTMLSelectElement> = event => {
    setMode(event.target.value);
    setError('');
  };
  const handleSubmit: React.FormEventHandler<HTMLFormElement> = event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    const base = { id: profile?.id ?? crypto.randomUUID(), name: value('name') };
    const next: RemoteProfile = isWeb
      ? {
          ...base,
          kind: 'web',
          provider: mode === 'claude' ? 'claude' : 'custom',
          url: value('url'),
        }
      : {
          ...base,
          kind: 'ssh',
          target: {
            backend: mode as 'cmux' | 'tmux' | 'shell',
            host: value('host'),
            port: value('port') ? Number(value('port')) : null,
            session: mode === 'shell' ? '' : value('session'),
            binary: mode === 'shell' ? '' : value('binary'),
            command: mode === 'shell' ? value('command') : '',
          },
        };
    const issue = validateProfile(next);
    if (issue) setError(issue);
    else onSave(next);
  };
  return (
    <form className='connection-form' onSubmit={handleSubmit}>
      <label className='field'>
        Connection name
        <input
          name='name'
          defaultValue={profile?.name ?? ''}
          placeholder='Build machine · Claude and Codex'
          required
          maxLength={100}
        />
      </label>
      <label className='field'>
        Connection type
        <select aria-label='Connection type' value={mode} onChange={handleModeChange}>
          <option value='cmux'>cmux TUI over SSH</option>
          <option value='tmux'>tmux over SSH</option>
          <option value='shell'>SSH shell / custom remote command</option>
          <option value='claude'>Claude Remote Control · browser</option>
          <option value='web'>Other provider session · browser</option>
        </select>
      </label>
      {isWeb ? (
        <>
          <label className='field'>
            Session URL
            <input
              key={mode}
              name='url'
              type='url'
              defaultValue={profile?.kind === 'web' ? profile.url : ''}
              placeholder={mode === 'claude' ? 'https://claude.ai/code/session_…' : 'https://…'}
              required
            />
          </label>
          <p className='connection-help'>
            {mode === 'claude'
              ? 'Enable /remote-control in the existing Claude Code session and paste its URL here. Claude handles login and session control in your browser.'
              : 'Save an HTTPS session link. It opens the provider’s interface in your browser; it is not an SSH terminal.'}{' '}
            Browser connections do not expose status or usage to Emdeck.
          </p>
        </>
      ) : (
        <>
          <div className='connection-fields'>
            <label className='field'>
              SSH host
              <input
                name='host'
                defaultValue={ssh?.host ?? ''}
                placeholder='dev@buildbox or SSH config alias'
                required
                autoComplete='off'
              />
            </label>
            <label className='field'>
              Port
              <input
                name='port'
                type='number'
                min={1}
                max={65535}
                defaultValue={ssh?.port ?? ''}
                placeholder='SSH config'
              />
            </label>
          </div>
          {mode === 'shell' ? (
            <label className='field'>
              Remote command (optional)
              <textarea
                name='command'
                defaultValue={ssh?.command ?? ''}
                placeholder='Leave blank for a shell, or enter a command for the remote OS'
                rows={3}
                maxLength={8192}
              />
            </label>
          ) : (
            <div className='connection-fields'>
              <label className='field'>
                Existing session
                <input name='session' defaultValue={ssh?.session || 'agents'} required />
              </label>
              <label className='field'>
                Remote binary
                <input
                  key={mode}
                  name='binary'
                  defaultValue={ssh?.backend === mode ? ssh.binary : mode}
                  required
                  placeholder={mode}
                />
              </label>
            </div>
          )}
          <p className='connection-help'>
            Uses your local OpenSSH client and SSH config for keys, host aliases and jump hosts.
            Host-key and password prompts appear in the terminal. No credentials are stored in
            Emdeck.
          </p>
          <p className='connection-help'>
            {mode === 'shell'
              ? 'This opens a new remote shell or runs your command. It cannot adopt an arbitrary terminal already running elsewhere. An ordinary shell may stop when disconnected.'
              : `Attach to an existing ${mode === 'cmux' ? 'headless cmux TUI' : 'tmux'} session. Detaching leaves its agents running. Manage its panes inside the attached terminal. No server installation or startup is automatic.`}
          </p>
        </>
      )}
      {error && (
        <p role='alert' className='connection-error'>
          {error}
        </p>
      )}
      <footer className='dialog-footer'>
        <button className='button secondary' type='button' onClick={onCancel}>
          Cancel
        </button>
        <button className='button primary' type='submit'>
          Save connection
        </button>
      </footer>
    </form>
  );
}
