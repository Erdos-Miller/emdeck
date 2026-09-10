import { paneName } from '../services/terminal-title';
import { Crosshair, Pencil, RotateCcw, X } from 'lucide-react';
import type {
  AgentObservation,
  AgentPreferences,
  AgentUsage,
  Pane,
  PaneState,
} from '../../../shared/contracts/workspace';
import { agentKind, agentStatus, metricNumber } from '../lib/agents';
import { WindowUsage } from './WindowUsage';
import { remoteStatus } from '../services/connections';
interface Props {
  pane: Pane;
  state?: PaneState;
  observed?: AgentObservation;
  report?: AgentUsage;
  selected: boolean;
  preferences: AgentPreferences;
  clock: number;
  onFocus: (id: string, solo?: boolean) => void;
  onRename: (pane: Pane) => void;
  onRestart: (pane: Pane) => void;
  onClose: (pane: Pane) => void;
}
export default function AgentCard({
  pane,
  state,
  observed,
  report,
  selected,
  preferences,
  clock,
  onFocus,
  onRename,
  onRestart,
  onClose,
}: Props) {
  const handleFocusClick = () => onFocus(pane.id);
  const handleFocusClick2 = () => onFocus(pane.id, true);
  const handleRenameClick = () => onRename(pane);
  const handleRestartClick = () => onRestart(pane);
  const handleCloseClick = () => onClose(pane);
  const kind = agentKind(pane.command),
    status = agentStatus(state, observed);
  const percent = report?.contextPercent ?? observed?.contextPercent;
  const model = report?.model ?? observed?.model;
  return (
    <article
      key={pane.id}
      className={`agent-card ${selected ? 'selected' : ''} ${status.tone}`}
      aria-label={`${paneName(pane)} agent`}
    >
      <button
        className='agent-card-title'
        onClick={handleFocusClick}
        title={`Focus ${paneName(pane)}`}
      >
        <i style={{ background: pane.color }} />
        <strong>{paneName(pane)}</strong>
        <small>{pane.remote?.target.backend ?? (kind === 'custom' ? 'command' : kind)}</small>
      </button>
      <p className='agent-cwd' title={pane.cwd || 'Project root'}>
        {pane.remote?.target.host ?? (pane.cwd ? `./${pane.cwd}` : 'Project root')}
      </p>
      {preferences.metrics.map(metric => {
        if (metric === 'activity')
          return (
            <div
              className={`agent-activity ${status.tone}`}
              key={metric}
              title='Detected labels are observations of the terminal UI, not authoritative lifecycle events.'
            >
              <i />
              {pane.remote ? remoteStatus(state) : status.label}
            </div>
          );
        if (metric === 'elapsed')
          return (
            <div className='agent-stat' key={metric}>
              <span>Session</span>
              <strong>
                {pane.startedAt
                  ? `${Math.max(0, Math.floor(((pane.endedAt ?? clock) - pane.startedAt) / 60000))} min`
                  : '—'}
              </strong>
            </div>
          );
        if (kind === 'shell') return null;
        if (metric === 'model')
          return (
            <div className='agent-stat' key={metric}>
              <span>Model{!report?.model && model ? ' · detected' : ''}</span>
              <strong>{model ?? 'Not reported'}</strong>
            </div>
          );
        if (metric === 'context')
          return (
            <div className='agent-context' key={metric}>
              <div className='agent-stat'>
                <span>
                  Context
                  {report?.contextPercent == null && percent != null ? ' · detected' : ''}
                </span>
                <strong>{percent == null ? 'Not reported' : `${percent.toFixed(0)}% used`}</strong>
              </div>
              {percent != null && (
                <progress
                  aria-label={`${paneName(pane)} context usage`}
                  value={percent}
                  max={100}
                />
              )}
            </div>
          );
        if (metric === 'tokens')
          return (
            <div
              className='agent-stat'
              key={metric}
              title='Claude reports tokens in the current context and latest output, not cumulative billed session tokens.'
            >
              <span>Context in / last out</span>
              <strong>
                {report && (report.inputTokens != null || report.outputTokens != null)
                  ? `${metricNumber(report.inputTokens)} / ${metricNumber(report.outputTokens)}`
                  : 'Not reported'}
              </strong>
            </div>
          );
        if (metric === 'cost')
          return (
            <div
              className='agent-stat'
              key={metric}
              title="Provider's session estimate; it may differ from your actual bill."
            >
              <span>Est. session cost</span>
              <strong>
                {report?.costUsd == null ? 'Not reported' : `$${report.costUsd.toFixed(3)}`}
              </strong>
            </div>
          );
        if (metric === 'limits' && kind !== 'codex')
          return (
            <div key={metric}>
              {report?.limits.length ? (
                report.limits.map(window => (
                  <WindowUsage
                    key={window.label}
                    window={window}
                    resets={preferences.metrics.includes('resets')}
                    now={clock}
                  />
                ))
              ) : (
                <p className='agent-no-usage'>Account limits not reported.</p>
              )}
            </div>
          );
        return null;
      })}
      {report && (
        <p className='agent-usage-source' title={report.sessionId ?? ''}>
          {report.source} · {new Date(report.updatedAt * 1000).toLocaleTimeString()}
        </p>
      )}
      {kind === 'claude' && !report && (
        <p className='agent-no-usage'>
          {state === 'preview'
            ? 'Usage is available in the desktop app.'
            : pane.command.trim() !== 'claude'
              ? 'Usage integration requires the Claude launch preset.'
              : preferences.claudeUsage
                ? 'Waiting for Claude usage. Restart older sessions to connect.'
                : 'Claude usage integration is off.'}
        </p>
      )}
      <div className='agent-card-actions'>
        <button
          className='icon-button'
          title={`Focus only ${paneName(pane)}`}
          onClick={handleFocusClick2}
        >
          <Crosshair size={13} />
        </button>
        <button
          className='icon-button'
          title={`Rename ${paneName(pane)}`}
          onClick={handleRenameClick}
        >
          <Pencil size={12} />
        </button>
        {['exited', 'error', 'preview'].includes(state ?? '') && (
          <button
            className='icon-button'
            title={`Restart ${paneName(pane)}`}
            onClick={handleRestartClick}
          >
            <RotateCcw size={12} />
          </button>
        )}
        <span className='spacer' />
        <button
          className='icon-button'
          title={`Close session ${paneName(pane)}`}
          onClick={handleCloseClick}
        >
          <X size={13} />
        </button>
      </div>
    </article>
  );
}
