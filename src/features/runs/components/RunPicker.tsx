import {
  Check,
  Clock3,
  Copy,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  TerminalSquare,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import type { RunConfig } from '../../../shared/contracts/workspace';
import type { useRunConfigurations } from '../hooks/useRunConfigurations';
import type { RunnerPreference } from '../services/runDiscovery';
import { runners } from '../services/runDiscovery';
interface Props {
  runs: ReturnType<typeof useRunConfigurations>;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onSelect: (id: string) => void;
  onRun: (run: RunConfig) => void;
  onEdit: (run?: RunConfig) => void;
}
export default function RunPicker({ runs, enabled, onToggle, onSelect, onRun, onEdit }: Props) {
  const handleSearchRunCommandsChange: React.ComponentProps<'input'>['onChange'] = e =>
    setQuery(e.target.value);
  const handleAddConfigurationClick = () => onEdit();
  const handleToggleChange: React.ComponentProps<'input'>['onChange'] = e =>
    onToggle(e.target.checked);
  const handleScriptRunnerChange: React.ComponentProps<'select'>['onChange'] = e =>
    runs.setRunner(e.target.value as RunnerPreference);
  const [query, setQuery] = useState('');
  const filter = (items: RunConfig[]) =>
    items.filter(run =>
      `${run.name} ${run.command} ${run.cwd}`.toLowerCase().includes(query.trim().toLowerCase())
    );
  function rows(
    items: (RunConfig & {
      lastUsed?: number;
    })[],
    recent = false
  ) {
    return filter(items).map(run => {
      const handleSelectClick = () => onSelect(run.id);
      const handleEditClick = () => onEdit(run);
      const handleClick = () => runs.remove(run.id);
      const handleRunClick = () => onRun(run);
      const at = items.find(item => item.id === run.id)?.lastUsed;
      const busy = run.source === 'detected' && runs.loading;
      return (
        <div className={`run-entry ${runs.selected?.id === run.id ? 'selected' : ''}`} key={run.id}>
          <button
            className='run-entry-select'
            title={`Select ${run.name}\n${run.command}${run.script ? `\n${run.script}` : ''}`}
            disabled={busy}
            onClick={handleSelectClick}
          >
            {runs.selected?.id === run.id ? (
              <Check size={14} />
            ) : run.source === 'custom' ? (
              <TerminalSquare size={14} />
            ) : (
              <Sparkles size={14} />
            )}
            <span>
              <strong>
                {run.name}
                {recent && (
                  <small className='run-source'>
                    {run.source === 'custom' ? 'Custom' : 'Detected'}
                  </small>
                )}
              </strong>
              <code>{run.command}</code>
              {run.cwd && <small>in {run.cwd}</small>}
              {recent && at && (
                <small title={new Date(at).toLocaleString()}>
                  Last launched{' '}
                  {new Date(at).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </small>
              )}
            </span>
          </button>
          <div className='run-entry-actions'>
            {!recent && (
              <button
                className='icon-button'
                title={run.source === 'custom' ? `Edit ${run.name}` : `Customize ${run.name}`}
                onClick={handleEditClick}
              >
                {run.source === 'custom' ? <Settings2 size={13} /> : <Copy size={13} />}
              </button>
            )}
            {!recent && run.source === 'custom' && (
              <button className='icon-button' title={`Remove ${run.name}`} onClick={handleClick}>
                <Trash2 size={13} />
              </button>
            )}
            <button
              className='icon-button run-entry-launch'
              title={`Run ${run.name}`}
              disabled={busy}
              onClick={handleRunClick}
            >
              <Play size={14} />
            </button>
          </div>
        </div>
      );
    });
  }
  return (
    <div className='run-popover popover' role='region' aria-label='Run configurations'>
      <div className='popover-title'>
        RUN COMMANDS<span>F5 runs selected</span>
      </div>
      <div className='run-search'>
        <Search size={14} />
        <input
          autoFocus
          aria-label='Search run commands'
          placeholder='Find a command…'
          value={query}
          onChange={handleSearchRunCommandsChange}
        />
      </div>
      <div className='run-sections'>
        <section aria-label='Recently used' className='run-section'>
          <h3>
            <Clock3 size={13} />
            Recently used
            {runs.recent.length > 0 && (
              <button title='Clear run history' onClick={runs.clearHistory}>
                Clear
              </button>
            )}
          </h3>
          {rows(runs.recent, true)}
          {!filter(runs.recent).length && (
            <p className='run-empty'>
              {query.trim() ? 'No matching recent commands.' : 'Commands you launch appear here.'}
            </p>
          )}
        </section>
        <section aria-label='My commands' className='run-section'>
          <h3>
            <TerminalSquare size={13} />
            My commands<span className='run-count'>{runs.custom.length}</span>
            <button
              title='Add configuration'
              aria-label='Add configuration'
              onClick={handleAddConfigurationClick}
            >
              <Plus size={13} />
              Add
            </button>
          </h3>
          {rows(runs.custom)}
          {!filter(runs.custom).length && (
            <p className='run-empty'>
              {query.trim()
                ? 'No matching custom commands.'
                : 'Save your own commands with their working directory.'}
            </p>
          )}
        </section>
        <section aria-label='Detected scripts' className='run-section'>
          <h3>
            <Sparkles size={13} />
            Detected scripts
            {runs.discovery.runner && <span className='runner-badge'>{runs.discovery.runner}</span>}
            <button
              className='icon-button'
              title='Refresh detected scripts'
              disabled={!enabled || runs.loading}
              onClick={runs.refresh}
            >
              <RefreshCw size={13} />
            </button>
          </h3>
          {enabled ? (
            <>
              {runs.loading && (
                <p className='run-empty' role='status'>
                  Checking project scripts…
                </p>
              )}
              {runs.discovery.reason && (
                <p className='run-detection-reason'>{runs.discovery.reason}</p>
              )}
              {runs.discovery.notice && (
                <p className='run-notice' role='status'>
                  {runs.discovery.notice}
                </p>
              )}
              {rows(runs.discovery.configs)}
              {!runs.loading &&
                !filter(runs.discovery.configs).length &&
                !runs.discovery.notice && (
                  <p className='run-empty'>
                    {query.trim()
                      ? 'No matching detected scripts.'
                      : 'No scripts defined in package.json.'}
                  </p>
                )}
            </>
          ) : (
            <p className='run-empty'>Automatic detection is off. Your commands remain available.</p>
          )}
        </section>
      </div>
      <div className='run-discovery-settings'>
        <label className='run-detection-toggle'>
          <span>
            Auto-detect project scripts
            <small>Project root only · setting applies to all projects</small>
          </span>
          <input type='checkbox' checked={enabled} onChange={handleToggleChange} />
        </label>
        {enabled && (
          <label className='run-runner-setting'>
            Script runner
            <select
              aria-label='Script runner'
              value={runs.runner}
              onChange={handleScriptRunnerChange}
            >
              <option value='auto'>Auto-detect</option>
              {runners.map(runner => (
                <option key={runner} value={runner}>
                  {runner === 'bun' ? 'Bun' : runner === 'yarn' ? 'Yarn' : runner}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
