import {
  Bot,
  ChevronDown,
  Columns2,
  Command,
  Grid2X2,
  Maximize2,
  Minus,
  PanelBottom,
  Plus,
  Rows2,
  TerminalSquare,
} from 'lucide-react';
import { lazy, Suspense } from 'react';
import AgentPanel from '../../features/agents/components/AgentPanel';
import type { WorkspaceController } from '../hooks/useWorkspace';
const TerminalPane = lazy(() => import('../../features/agents/components/TerminalPane'));
const colors = ['#b8ee86', '#c4a0ed', '#8bbbf5', '#f1b17f', '#f38ea2'];
type Props = {
  model: Pick<
    WorkspaceController,
    | 'terminalVisible'
    | 'terminalFull'
    | 'resize'
    | 'resizeKey'
    | 'setTerminalHeight'
    | 'terminalPanel'
    | 'panes'
    | 'agentPreferences'
    | 'setAgentPreferences'
    | 'layout'
    | 'setLayout'
    | 'setMaxPane'
    | 'settings'
    | 'setSettings'
    | 'project'
    | 'setAgentMenu'
    | 'agentMenu'
    | 'addPane'
    | 'customPane'
    | 'setTerminalFull'
    | 'setTerminalVisible'
    | 'paneStates'
    | 'agentObservations'
    | 'agentUsage'
    | 'selectedPane'
    | 'focusAgent'
    | 'renameAgent'
    | 'restartAgent'
    | 'closePane'
    | 'maxPane'
    | 'paneState'
    | 'fail'
    | 'observeAgent'
    | 'updateAgentUsage'
    | 'paneFocus'
    | 'setSelectedPane'
  >;
};
export default function TerminalPanel({ model }: Props) {
  const handleResizeTerminalPanelPointerDown: React.ComponentProps<'div'>['onPointerDown'] = e =>
    resize('terminal', e);
  const handleResizeTerminalPanelKeyDown: React.ComponentProps<'div'>['onKeyDown'] = e =>
    resizeKey('terminal', e);
  const handleResizeTerminalPanelDoubleClick = () => setTerminalHeight(310);
  const handleToggleAgentOverviewClick = () =>
    setAgentPreferences(value => ({ ...value, visible: !value.visible }));
  const handleFullWidthTerminalPanelClick = () =>
    setSettings(previous => ({
      ...previous,
      terminalPlacement: previous.terminalPlacement === 'workspace' ? 'editor' : 'workspace',
    }));
  const handleAgentMenuClick = () => setAgentMenu(s => !s);
  const handleAgentMenuClick2 = () => setAgentMenu(false);
  const handleClick = () => void customPane();
  const handleTerminalFullClick = () => setTerminalFull(f => !f);
  const handleHideTerminalsSessionsKeepClick = () => setTerminalVisible(false);
  const handleRename: React.ComponentProps<typeof AgentPanel>['onRename'] = pane =>
    void renameAgent(pane);
  const handleClose: React.ComponentProps<typeof AgentPanel>['onClose'] = pane =>
    void closePane(pane);
  const handleAgentMenuLaunch = () => setAgentMenu(true);
  const handleClick2 = () => addPane('Terminal');
  const {
    terminalVisible,
    terminalFull,
    resize,
    resizeKey,
    setTerminalHeight,
    terminalPanel,
    panes,
    agentPreferences,
    setAgentPreferences,
    layout,
    setLayout,
    setMaxPane,
    settings,
    setSettings,
    project,
    setAgentMenu,
    agentMenu,
    addPane,
    customPane,
    setTerminalFull,
    setTerminalVisible,
    paneStates,
    agentObservations,
    agentUsage,
    selectedPane,
    focusAgent,
    renameAgent,
    restartAgent,
    closePane,
    maxPane,
    paneState,
    fail,
    observeAgent,
    updateAgentUsage,
    paneFocus,
    setSelectedPane,
  } = model;
  return (
    <>
      <div
        style={{ display: terminalVisible && !terminalFull ? undefined : 'none' }}
        role='separator'
        aria-label='Resize terminal panel'
        aria-orientation='horizontal'
        tabIndex={0}
        title='Drag to resize terminals. Double-click to reset.'
        className='terminal-resizer'
        onPointerDown={handleResizeTerminalPanelPointerDown}
        onKeyDown={handleResizeTerminalPanelKeyDown}
        onDoubleClick={handleResizeTerminalPanelDoubleClick}
      />
      <section
        ref={terminalPanel}
        className={`terminal-panel ${terminalFull ? 'full' : ''}`}
        style={{
          display: terminalVisible ? undefined : 'none',
        }}
      >
        <header className='terminal-toolbar'>
          <div className='terminal-heading'>
            <TerminalSquare size={14} />
            <strong>TERMINALS</strong>
            <span className='count-badge'>{panes.length}</span>
          </div>
          <span className='terminal-subtitle'>A place for every agent.</span>
          <div className='spacer' />
          <button
            className={`icon-button ${agentPreferences.visible ? 'selected' : ''}`}
            title='Toggle agent overview'
            aria-pressed={agentPreferences.visible}
            onClick={handleToggleAgentOverviewClick}
          >
            <Bot size={15} />
          </button>
          <div className='layout-controls'>
            {(
              [
                ['columns', Columns2, 'Side by side'],
                ['rows', Rows2, 'Stacked'],
                ['grid', Grid2X2, 'Grid'],
              ] as const
            ).map(([value, Icon, title]) => {
              const handleLayoutClick = () => {
                setLayout(value);
                setMaxPane(null);
              };
              return (
                <button
                  key={value}
                  className={`icon-button ${layout === value ? 'selected' : ''}`}
                  title={title}
                  onClick={handleLayoutClick}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>
          <span className='toolbar-separator' />
          <button
            className={`icon-button ${settings.terminalPlacement === 'workspace' ? 'selected' : ''}`}
            title='Full-width terminal panel'
            aria-pressed={settings.terminalPlacement === 'workspace'}
            onClick={handleFullWidthTerminalPanelClick}
          >
            <PanelBottom size={15} />
          </button>
          <span className='toolbar-separator' />
          <div className='agent-menu-wrapper'>
            <button className='add-terminal' disabled={!project} onClick={handleAgentMenuClick}>
              <Plus size={14} />
              New terminal
              <ChevronDown size={11} />
            </button>
            {agentMenu && (
              <>
                <div className='popover-dismiss' onClick={handleAgentMenuClick2} />
                <div className='agent-popover popover'>
                  <div className='popover-title'>LAUNCH IN A NEW PANE</div>
                  {[
                    ['Terminal', '', 'Your default shell'],
                    ['Codex', 'codex', 'OpenAI coding agent'],
                    ['Claude', 'claude', 'Claude Code'],
                    ['Gemini', 'gemini', 'Gemini CLI'],
                  ].map(([name, cmd, detail], i) => {
                    const handleClick = () => addPane(name, cmd);
                    return (
                      <button className='agent-option' key={name} onClick={handleClick}>
                        <TerminalSquare size={16} style={{ color: colors[i] }} />
                        <span>
                          <strong>{name}</strong>
                          <small>{detail}</small>
                        </span>
                        <Plus size={13} />
                      </button>
                    );
                  })}
                  <button className='menu-item' onClick={handleClick}>
                    <Command size={14} />
                    Custom command…
                  </button>
                  <p className='popover-note'>Uses CLIs already installed on your computer.</p>
                </div>
              </>
            )}
          </div>
          <button
            className='icon-button'
            title={terminalFull ? 'Restore editor' : 'Expand terminals'}
            onClick={handleTerminalFullClick}
          >
            {terminalFull ? <Minus size={14} /> : <Maximize2 size={13} />}
          </button>
          <button
            className='icon-button'
            title='Hide terminals (sessions keep running)'
            onClick={handleHideTerminalsSessionsKeepClick}
          >
            <ChevronDown size={15} />
          </button>
        </header>
        <div className='terminal-workspace'>
          {project && (
            <AgentPanel
              panes={panes}
              states={paneStates}
              observations={agentObservations}
              usage={agentUsage}
              selected={selectedPane}
              preferences={agentPreferences}
              active={terminalVisible && agentPreferences.visible}
              onPreferences={setAgentPreferences}
              onFocus={focusAgent}
              onRename={handleRename}
              onRestart={restartAgent}
              onClose={handleClose}
              onLaunch={handleAgentMenuLaunch}
            />
          )}
          <div
            className={`terminal-grid layout-${layout} ${maxPane ? 'has-maximized' : ''}`}
            style={{ '--pane-count': panes.length } as React.CSSProperties}
          >
            {panes.length ? (
              <Suspense fallback={<div className='loading'>Starting terminals…</div>}>
                {panes.map(pane => {
                  const handleMaxPaneMaximize = () =>
                    setMaxPane(v => (v === pane.id ? null : pane.id));
                  const handleClose = () => void closePane(pane);
                  const handleRestart = () => restartAgent(pane);
                  const handleSelectedPaneFocus = () => setSelectedPane(pane.id);
                  return (
                    <div
                      className={`pane-container ${maxPane && maxPane !== pane.id ? 'pane-hidden' : ''}`}
                      key={pane.id}
                    >
                      <TerminalPane
                        pane={pane}
                        root={project!.root}
                        settings={settings}
                        maximized={maxPane === pane.id}
                        onMaximize={handleMaxPaneMaximize}
                        onClose={handleClose}
                        onRestart={handleRestart}
                        onState={paneState}
                        onError={fail}
                        onObservation={observeAgent}
                        onUsage={updateAgentUsage}
                        enhancedUsage={agentPreferences.claudeUsage}
                        focusRequest={paneFocus.id === pane.id ? paneFocus.sequence : 0}
                        selected={selectedPane === pane.id}
                        onFocus={handleSelectedPaneFocus}
                      />
                    </div>
                  );
                })}
              </Suspense>
            ) : (
              <div className='terminal-empty'>
                <div className='terminal-empty-icon'>
                  <TerminalSquare size={24} />
                </div>
                <div>
                  <h3>Bring your agents to the table.</h3>
                  <p>Run Codex, Claude Code, or any CLI in its own terminal.</p>
                </div>
                <button className='button secondary' disabled={!project} onClick={handleClick2}>
                  <Plus size={14} />
                  Start a terminal
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
