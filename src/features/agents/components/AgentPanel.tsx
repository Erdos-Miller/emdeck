import { paneName } from '../services/terminal-title';
import { Bot, ChevronDown, ChevronUp, Plus, RefreshCw, Search, Settings2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { call, native } from '../../../platform/desktop/api';
import type {
  AccountUsage,
  AgentMetric,
  AgentObservation,
  AgentPreferences,
  AgentUsage,
  Pane,
  PaneState,
} from '../../../shared/contracts/workspace';
import { agentKind, agentMetrics, agentStatus } from '../lib/agents';
import AgentCard from './AgentCard';
import { WindowUsage } from './WindowUsage';
interface Props {
  panes: Pane[];
  states: Record<string, PaneState>;
  observations: Record<string, AgentObservation>;
  usage: Record<string, AgentUsage>;
  selected: string | null;
  preferences: AgentPreferences;
  active: boolean;
  onPreferences: (value: AgentPreferences) => void;
  onFocus: (id: string, solo?: boolean) => void;
  onRename: (pane: Pane) => void;
  onRestart: (pane: Pane) => void;
  onClose: (pane: Pane) => void;
  onLaunch: () => void;
}
export default function AgentPanel({
  panes,
  states,
  observations,
  usage,
  selected,
  preferences,
  active,
  onPreferences,
  onFocus,
  onRename,
  onRestart,
  onClose,
  onLaunch,
}: Props) {
  const handleCustomizeAgentOverviewClick = () => setSettingsOpen(v => !v);
  const handleHideAgentOverviewClick = () => onPreferences({ ...preferences, visible: false });
  const handlePreferencesChange: React.ComponentProps<'input'>['onChange'] = e =>
    onPreferences({ ...preferences, compact: e.target.checked });
  const handlePreferencesChange2: React.ComponentProps<'input'>['onChange'] = e =>
    onPreferences({ ...preferences, showShells: e.target.checked });
  const handlePreferencesChange3: React.ComponentProps<'input'>['onChange'] = e =>
    onPreferences({ ...preferences, claudeUsage: e.target.checked });
  const handleCodexQuotaRefreshChange: React.ComponentProps<'select'>['onChange'] = e =>
    onPreferences({ ...preferences, refreshSeconds: Number(e.target.value) });
  const handleFindAgentsChange: React.ComponentProps<'input'>['onChange'] = e =>
    setQuery(e.target.value);
  const handleFilterAgentsChange: React.ComponentProps<'select'>['onChange'] = e =>
    setFilter(e.target.value);
  const handleSortAgentsChange: React.ComponentProps<'select'>['onChange'] = e =>
    setSort(e.target.value);
  const handleFocusClick = () => onFocus(attention[0].id, true);
  const handleRefreshCodexAccountUsageClick = () => void refresh();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('attention');
  const [clock, setClock] = useState(Date.now());
  const [account, setAccount] = useState<AccountUsage | null>(null);
  const [accountError, setAccountError] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const accountLock = useRef(false);
  const alive = useRef(true);
  const has = (metric: AgentMetric) => preferences.metrics.includes(metric);
  const refresh = async () => {
    if (!native || accountLock.current) return;
    accountLock.current = true;
    setAccountBusy(true);
    setAccountError('');
    try {
      const result = await call('codex_account_usage');
      if (alive.current) setAccount(result);
    } catch (e) {
      if (alive.current) setAccountError(String(e).replace(/^Error: /, ''));
    } finally {
      accountLock.current = false;
      if (alive.current) setAccountBusy(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const codex = panes.some(p => agentKind(p.command) === 'codex');
  const showAccount = codex && has('limits');
  useEffect(() => {
    if (!active || !showAccount || !preferences.refreshSeconds) return;
    if (document.visibilityState === 'visible') void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, preferences.refreshSeconds * 1000);
    return () => clearInterval(timer);
  }, [active, showAccount, preferences.refreshSeconds]);
  const needsClock = panes.length > 0 && (has('elapsed') || has('limits'));
  useEffect(() => {
    if (!active || !needsClock) return;
    setClock(Date.now());
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setClock(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, [active, needsClock]);
  const attention = panes.filter(
    p => agentStatus(states[p.id], observations[p.id]).tone === 'attention'
  );
  const shown = panes
    .filter(pane => {
      const kind = agentKind(pane.command);
      const status = agentStatus(states[pane.id], observations[pane.id]);
      return (
        (preferences.showShells || kind !== 'shell') &&
        (filter === 'all' ||
          (filter === 'attention' ? status.tone === 'attention' : kind === filter)) &&
        `${paneName(pane)} ${pane.command} ${pane.cwd}`.toLowerCase().includes(query.toLowerCase())
      );
    })
    .sort((a, b) =>
      sort === 'name'
        ? paneName(a).localeCompare(paneName(b))
        : sort === 'attention'
          ? Number(attention.includes(b)) - Number(attention.includes(a))
          : 0
    );
  const toggle = (metric: AgentMetric) =>
    onPreferences({
      ...preferences,
      metrics: has(metric)
        ? preferences.metrics.filter(m => m !== metric)
        : [...preferences.metrics, metric],
    });
  const move = (metric: AgentMetric, delta: number) => {
    if (metric === 'resets') return;
    const metrics = preferences.metrics.filter(m => m !== 'resets');
    const index = metrics.indexOf(metric),
      target = index + delta;
    if (index < 0 || target < 0 || target >= metrics.length) return;
    [metrics[index], metrics[target]] = [metrics[target], metrics[index]];
    onPreferences({ ...preferences, metrics: has('resets') ? [...metrics, 'resets'] : metrics });
  };
  return (
    <aside
      className={`agent-panel ${preferences.compact ? 'compact' : ''}`}
      aria-label='Agent overview'
      hidden={!preferences.visible}
    >
      <header>
        <Bot size={16} />
        <strong>AGENTS</strong>
        <span className='count-badge'>
          {panes.filter(p => agentKind(p.command) !== 'shell').length}
        </span>
        <span className='spacer' />
        <button
          className='icon-button'
          title='Customize agent overview'
          aria-expanded={settingsOpen}
          onClick={handleCustomizeAgentOverviewClick}
        >
          <Settings2 size={14} />
        </button>
        <button
          className='icon-button'
          title='Hide agent overview'
          onClick={handleHideAgentOverviewClick}
        >
          <X size={13} />
        </button>
      </header>
      <div className='agent-panel-scroll'>
        {settingsOpen && (
          <section className='agent-customize' aria-label='Customize agents'>
            <h3>Visible details</h3>
            {[...agentMetrics]
              .sort(([a], [b]) => {
                const order = (id: AgentMetric) =>
                  preferences.metrics.indexOf(id) < 0 ? 100 : preferences.metrics.indexOf(id);
                return order(a) - order(b);
              })
              .map(([id, label]) => {
                const handleChange = () => toggle(id);
                const handleClick = () => move(id, -1);
                const handleClick2 = () => move(id, 1);
                return (
                  <div className='agent-metric-setting' key={id}>
                    <label>
                      <input type='checkbox' checked={has(id)} onChange={handleChange} />
                      {label}
                    </label>
                    {has(id) && id !== 'resets' && (
                      <span>
                        <button
                          className='icon-button'
                          title={`Move ${label} up`}
                          disabled={
                            preferences.metrics.filter(m => m !== 'resets').indexOf(id) === 0
                          }
                          onClick={handleClick}
                        >
                          <ChevronUp size={11} />
                        </button>
                        <button
                          className='icon-button'
                          title={`Move ${label} down`}
                          disabled={preferences.metrics.filter(m => m !== 'resets').at(-1) === id}
                          onClick={handleClick2}
                        >
                          <ChevronDown size={11} />
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            <label className='agent-preference'>
              <input
                type='checkbox'
                checked={preferences.compact}
                onChange={handlePreferencesChange}
              />
              Compact cards
            </label>
            <label className='agent-preference'>
              <input
                type='checkbox'
                checked={preferences.showShells}
                onChange={handlePreferencesChange2}
              />
              Include shell terminals
            </label>
            <label className='agent-preference'>
              <input
                type='checkbox'
                checked={preferences.claudeUsage}
                onChange={handlePreferencesChange3}
              />
              Claude usage integration
            </label>
            <p>
              Adds a Emdeck status line to new Claude preset sessions. Saved CLI settings stay
              unchanged. Disable to use your usual status line.
            </p>
            <label className='field'>
              Codex quota refresh
              <select
                aria-label='Codex quota refresh'
                value={preferences.refreshSeconds}
                onChange={handleCodexQuotaRefreshChange}
              >
                <option value={0}>Manual only</option>
                <option value={60}>Every minute while visible</option>
                <option value={300}>Every 5 minutes while visible</option>
              </select>
            </label>
          </section>
        )}
        <div className='agent-search'>
          <Search size={12} />
          <input
            aria-label='Find agents'
            placeholder='Find agent or folder…'
            value={query}
            onChange={handleFindAgentsChange}
          />
        </div>
        <div className='agent-filters'>
          <select aria-label='Filter agents' value={filter} onChange={handleFilterAgentsChange}>
            <option value='all'>All sessions</option>
            <option value='attention'>Needs attention ({attention.length})</option>
            <option value='claude'>Claude</option>
            <option value='codex'>Codex</option>
            <option value='gemini'>Gemini</option>
            <option value='custom'>Custom commands</option>
            <option value='shell'>Shells</option>
          </select>
          <select aria-label='Sort agents' value={sort} onChange={handleSortAgentsChange}>
            <option value='attention'>Attention first</option>
            <option value='name'>Name</option>
            <option value='created'>Launch order</option>
          </select>
        </div>
        {attention.length > 0 && (
          <button className='agent-attention' onClick={handleFocusClick}>
            {attention.length} {attention.length === 1 ? 'session needs' : 'sessions need'}{' '}
            attention
            <ChevronDown size={12} />
          </button>
        )}
        {shown.map(pane => (
          <AgentCard
            key={pane.id}
            pane={pane}
            state={states[pane.id]}
            observed={observations[pane.id]}
            report={usage[pane.id]}
            selected={selected === pane.id}
            preferences={preferences}
            clock={clock}
            onFocus={onFocus}
            onRename={onRename}
            onRestart={onRestart}
            onClose={onClose}
          />
        ))}
        {!shown.length && (
          <p className='agent-no-usage'>
            {panes.length
              ? 'No sessions match these filters.'
              : 'Launch an agent to track it here.'}
          </p>
        )}
        {showAccount && (
          <section className='agent-account' aria-label='Codex account usage'>
            <header>
              <strong>Codex account</strong>
              <button
                className='icon-button'
                title='Refresh Codex account usage'
                disabled={accountBusy || !native}
                onClick={handleRefreshCodexAccountUsageClick}
              >
                <RefreshCw size={13} className={accountBusy ? 'spinning' : ''} />
              </button>
            </header>
            <p>Shared across your Codex sessions.</p>
            {accountError && (
              <p className='agent-usage-error' role='alert'>
                {accountError}
              </p>
            )}
            {account?.limits.map(window => (
              <WindowUsage key={window.label} window={window} resets={has('resets')} now={clock} />
            ))}
            {!account && (
              <p>
                {native
                  ? 'Refresh to read limits from your signed-in Codex CLI.'
                  : 'Account usage is available in the desktop app.'}
              </p>
            )}
            {account && !account.limits.length && (
              <p>Your Codex account did not report quota windows.</p>
            )}
            {account && (
              <p className='agent-usage-source'>
                Updated {new Date(account.updatedAt * 1000).toLocaleTimeString()}
                {accountError ? ' · previous reading' : ''}
              </p>
            )}
          </section>
        )}
        <button className='button secondary agent-launch' onClick={onLaunch}>
          <Plus size={13} />
          Launch agent or terminal
        </button>
      </div>
    </aside>
  );
}
