import type { ReactNode } from 'react';
import type { BackgroundSession } from '../services/background-workspaces';
import type { SessionDeskController } from '../hooks/useSessionDesk';
import type { Settings } from '../../../shared/contracts/workspace';
import { sessionName } from '../services/terminal-title';
import SessionTerminal from './SessionTerminal';
import HideSessionButton from './HideSessionButton';

export default function BackgroundTerminal({
  session,
  model,
  settings,
  arrangeControl,
  onMaximize,
  onDetach,
  onHide,
  onFocus,
  focusRequest,
}: {
  session: BackgroundSession;
  model: SessionDeskController;
  settings: Settings;
  arrangeControl?: ReactNode;
  onMaximize: () => void;
  onDetach: () => void;
  onHide: () => void;
  onFocus: () => void;
  focusRequest: number;
}) {
  const { machine, pane } = session;
  const handleStop = () => model.requestOperation('stop', machine, pane);
  const handleRemove = () => model.requestOperation('remove', machine, pane);
  return machine.connection ? (
    <SessionTerminal
      connection={machine.connection}
      pane={pane}
      settings={settings}
      onDetach={onDetach}
      onHide={onHide}
      onStop={handleStop}
      onRemove={handleRemove}
      onMaximize={onMaximize}
      arrangeControl={arrangeControl}
      onFocus={onFocus}
      focusRequest={focusRequest}
    />
  ) : (
    <div className='session-disconnected'>
      {arrangeControl}
      <strong>{sessionName(pane)}</strong>
      <HideSessionButton name={sessionName(pane)} onHide={onHide} />
      <p>
        {machine.profile.name} is offline. Last reported state: {pane.agent.state}. Input is
        disabled.
      </p>
      <button onClick={onDetach}>Detach view</button>
    </div>
  );
}
