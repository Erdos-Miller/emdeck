import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionPane } from '../../../shared/contracts/sessions';
import type { Settings } from '../../../shared/contracts/workspace';
import { useSessionTerminal } from '../hooks/useSessionTerminal';
import { sessionName } from '../services/terminal-title';

interface Props {
  connection: string;
  pane: SessionPane;
  settings: Settings;
  onDetach: () => void;
  onStop: () => void;
  onMaximize: () => void;
  arrangeControl?: ReactNode;
  onFocus?: () => void;
  focusRequest?: number;
}
export default function SessionTerminal({
  connection,
  pane,
  settings,
  onDetach,
  onStop,
  onMaximize,
  arrangeControl,
  onFocus,
  focusRequest = 0,
}: Props) {
  const [attachmentError, setAttachmentError] = useState('');
  const theme = useMemo(
    () => ({
      background: settings.theme === 'light' ? '#fafbfc' : '#111418',
      foreground: settings.theme === 'light' ? '#343b48' : '#c5ccd6',
    }),
    [settings.theme]
  );
  const { host, terminal, error, takeControl } = useSessionTerminal({
    connection,
    id: pane.id,
    generation: pane.generation,
    settings,
    theme,
    onError: value => setAttachmentError(String(value)),
  });
  useEffect(() => {
    if (focusRequest) terminal.current?.focus();
  }, [focusRequest, terminal]);
  const handleDismissAttachment = () => setAttachmentError('');
  return (
    <section
      className='terminal-pane session-terminal'
      onFocusCapture={onFocus}
      aria-label={`${sessionName(pane)} persistent terminal`}
    >
      <header className='pane-header'>
        {arrangeControl}
        <strong title={sessionName(pane)}>{sessionName(pane)}</strong>
        <span
          className={`session-state ${pane.agent.state}`}
          title={`${pane.agent.source}: ${pane.agent.reason}`}
        >
          {pane.agent.state}
        </span>
        <span className='spacer' />
        <button title='Maximize or restore session' onClick={onMaximize}>
          Expand
        </button>
        <button title='Stop process on its machine' disabled={!pane.running} onClick={onStop}>
          Stop
        </button>
        <button title='Detach view; keep process running' onClick={onDetach}>
          Detach
        </button>
      </header>
      {error && (
        <div className='session-error' role='alert'>
          {error}
          <button onClick={takeControl}>Take control / retry</button>
        </div>
      )}
      {attachmentError && attachmentError !== error && (
        <div className='session-error' role='alert'>
          {attachmentError}
          <button onClick={handleDismissAttachment}>Dismiss</button>
        </div>
      )}
      <div className='terminal-host' ref={host} />
      <footer className='pane-footer'>
        <span>{pane.launch.cwd}</span>
        <span>Background session · {pane.agent.kind}</span>
      </footer>
    </section>
  );
}
