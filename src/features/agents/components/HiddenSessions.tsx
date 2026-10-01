import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import type { RefObject } from 'react';

interface Props {
  sessions: { key: string; name: string; detail: string }[];
  onShow: (keys: string[]) => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}

export default function HiddenSessions({ sessions, onShow, buttonRef }: Props) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const handleToggle = () => setExpanded(value => !value);
  const handleShowAll = () => {
    onShow(sessions.map(session => session.key));
    setExpanded(false);
    buttonRef.current?.focus();
  };
  return (
    <div className='hidden-sessions'>
      <button
        ref={buttonRef}
        className='hidden-sessions-toggle'
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={handleToggle}
      >
        <EyeOff size={13} />
        Hidden sessions ({sessions.length})
        <ChevronDown size={12} />
      </button>
      <div
        id={listId}
        className='hidden-sessions-list'
        hidden={!expanded}
        aria-label='Hidden sessions'
        role='region'
      >
        <p>Hidden sessions keep running and sending notifications.</p>
        {!sessions.length && (
          <p>No hidden sessions. Use the eye icon in a terminal header to hide one.</p>
        )}
        {sessions.map(session => {
          const handleShow = () => {
            onShow([session.key]);
            buttonRef.current?.focus();
          };
          return (
            <div className='hidden-session' key={session.key}>
              <span title={`${session.name} · ${session.detail}`}>
                <strong>{session.name}</strong>
                <small>{session.detail}</small>
              </span>
              <button
                className='button secondary'
                aria-label={`Show ${session.name}`}
                onClick={handleShow}
              >
                <Eye size={13} /> Show
              </button>
            </div>
          );
        })}
        {sessions.length > 1 && (
          <button className='button secondary' onClick={handleShowAll}>
            Show all sessions
          </button>
        )}
      </div>
    </div>
  );
}
