import { paneName } from '../services/terminal-title';
import { Bot, Folder, Globe, Layers, Monitor, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import type { RemoteProfile } from '../../../shared/contracts/remote';
import type {
  AgentObservation,
  AgentUsage,
  Pane,
  PaneState,
} from '../../../shared/contracts/workspace';
import { agentKind, agentStatus } from '../lib/agents';
import { remoteStatus, terminalSpaces } from '../services/connections';

interface Props {
  panes: Pane[];
  projectName: string;
  branch?: string;
  profiles: RemoteProfile[];
  selectedSpace: string;
  selectedPane: string | null;
  states: Record<string, PaneState>;
  observations: Record<string, AgentObservation>;
  usage: Record<string, AgentUsage>;
  onSpace: (id: string) => void;
  onPane: (pane: Pane) => void;
  onConnect: (profile: RemoteProfile) => void;
  onConnections: () => void;
  onLaunch: () => void;
}
export default function SessionRail({
  panes,
  projectName,
  branch,
  profiles,
  selectedSpace,
  selectedPane,
  states,
  observations,
  usage,
  onSpace,
  onPane,
  onConnect,
  onConnections,
  onLaunch,
}: Props) {
  const [query, setQuery] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const spaces = terminalSpaces(panes, projectName);
  const handleQuery: React.ChangeEventHandler<HTMLInputElement> = event =>
    setQuery(event.target.value);
  const handleAll = () => onSpace('all');
  const handleAttention = () => setAttentionOnly(value => !value);
  const shown = panes.filter(
    pane =>
      `${paneName(pane)} ${pane.cwd} ${pane.remote?.target.host ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!attentionOnly || agentStatus(states[pane.id], observations[pane.id]).tone === 'attention')
  );
  return (
    <aside className='session-rail' aria-label='Terminal workspaces'>
      <header>
        <Layers size={14} />
        <strong>SPACES</strong>
        <button className='icon-button' title='Manage remote connections' onClick={onConnections}>
          <Monitor size={14} />
        </button>
      </header>
      <div className='session-spaces'>
        <button
          className={`space-button ${selectedSpace === 'all' ? 'active' : ''}`}
          onClick={handleAll}
        >
          <Layers size={14} />
          <span>
            <strong>All sessions</strong>
            <small>
              {projectName}
              {branch ? ` · ${branch}` : ''}
            </small>
          </span>
          <b>{panes.length}</b>
        </button>
        {spaces.map(space => {
          const handleSelect = () => onSpace(space.id);
          return (
            <button
              key={space.id}
              className={`space-button ${selectedSpace === space.id ? 'active' : ''}`}
              onClick={handleSelect}
              title={space.detail}
            >
              <i className={space.remote ? 'remote-dot' : 'local-dot'} />
              <span>
                <strong>{space.name}</strong>
                <small>{space.detail}</small>
              </span>
              <b>{space.panes.length}</b>
            </button>
          );
        })}
        {!spaces.length && (
          <p className='rail-note'>Launch a terminal to create your first space.</p>
        )}
      </div>
      {profiles.length > 0 && (
        <div className='rail-connections'>
          <h4>CONNECTIONS</h4>
          {profiles.map(profile => {
            const handleConnect = () => onConnect(profile);
            return (
              <button
                key={profile.id}
                onClick={handleConnect}
                title={
                  profile.kind === 'web'
                    ? 'Open official session in browser'
                    : 'Connect or show the existing terminal'
                }
              >
                {profile.kind === 'web' ? <Globe size={13} /> : <Monitor size={13} />}
                <span>{profile.name}</span>
                <small>{profile.kind === 'web' ? 'web' : profile.target.backend}</small>
              </button>
            );
          })}
        </div>
      )}
      <header>
        <Bot size={14} />
        <strong>SESSIONS</strong>
        <button className='icon-button' title='Launch an agent' onClick={onLaunch}>
          <Plus size={14} />
        </button>
      </header>
      <div className='rail-search'>
        <Search size={12} />
        <input
          aria-label='Find terminal sessions'
          value={query}
          onChange={handleQuery}
          placeholder='Find a session…'
        />
      </div>
      <button
        className={`rail-attention ${attentionOnly ? 'active' : ''}`}
        aria-pressed={attentionOnly}
        onClick={handleAttention}
      >
        Needs attention{attentionOnly ? ' · showing only' : ''}
      </button>
      <div className='rail-sessions'>
        {shown.map(pane => {
          const status = agentStatus(states[pane.id], observations[pane.id]);
          const context = usage[pane.id]?.contextPercent ?? observations[pane.id]?.contextPercent;
          const handleSelect = () => onPane(pane);
          return (
            <button
              className={`rail-session ${selectedPane === pane.id ? 'active' : ''} ${status.tone}`}
              key={pane.id}
              onClick={handleSelect}
              title={`Focus ${paneName(pane)}`}
            >
              <i style={{ background: pane.color }} />
              <span>
                <strong>{paneName(pane)}</strong>
                <small>
                  {pane.remote
                    ? remoteStatus(states[pane.id])
                    : `${status.label} · ${agentKind(pane.command)}`}
                </small>
                <small className='rail-location'>
                  <Folder size={10} />
                  {pane.remote?.target.host ?? (pane.cwd || projectName)}
                </small>
              </span>
              {!pane.remote && context != null && <b title='Context used'>{context.toFixed(0)}%</b>}
            </button>
          );
        })}
        {!shown.length && (
          <p className='rail-note'>
            {panes.length ? 'No sessions match.' : 'Your agents will appear here.'}
          </p>
        )}
      </div>
      <footer>
        <span className='local-dot' />
        Local + remote
        <button title='Add or edit remote connections' onClick={onConnections}>
          Configure
        </button>
      </footer>
    </aside>
  );
}
