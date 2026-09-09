import { CircleHelp, FolderOpen, GitBranch, Search, Settings2, TerminalSquare } from 'lucide-react';
import type { WorkspaceController } from '../hooks/useWorkspace';
type Props = {
  model: Pick<
    WorkspaceController,
    | 'sidebar'
    | 'sidebarShown'
    | 'setSidebar'
    | 'setSidebarVisible'
    | 'settings'
    | 'setTerminalFull'
    | 'setPalette'
    | 'setPaletteQuery'
    | 'refreshGit'
    | 'git'
    | 'terminalFull'
    | 'setTerminalVisible'
    | 'setHelpOpen'
    | 'setSettingsOpen'
  >;
};
export default function ActivityBar({ model }: Props) {
  const handleExplorerClick = () => {
    setSidebar('files');
    setSidebarVisible(true);
    if (settings.terminalPlacement === 'workspace') setTerminalFull(false);
  };
  const handleQuickOpenClick = () => {
    setPalette(true);
    setPaletteQuery('');
  };
  const handleSourceControlClick = () => {
    setSidebar('git');
    setSidebarVisible(true);
    if (settings.terminalPlacement === 'workspace') setTerminalFull(false);
    void refreshGit();
  };
  const handleFocusTerminalsClick = () => {
    setTerminalFull(v => !v);
    setTerminalVisible(true);
  };
  const handleKeyboardShortcutsAndHelpClick = () => setHelpOpen(true);
  const handleAppearanceSettingsClick = () => setSettingsOpen(true);
  const {
    sidebar,
    sidebarShown,
    setSidebar,
    setSidebarVisible,
    settings,
    setTerminalFull,
    setPalette,
    setPaletteQuery,
    refreshGit,
    git,
    terminalFull,
    setTerminalVisible,
    setHelpOpen,
    setSettingsOpen,
  } = model;
  return (
    <nav className='activity-bar' aria-label='Workspace tools'>
      <button
        className={sidebar === 'files' && sidebarShown ? 'selected' : ''}
        title='Explorer'
        onClick={handleExplorerClick}
      >
        <FolderOpen size={20} />
      </button>
      <button title='Quick open' onClick={handleQuickOpenClick}>
        <Search size={20} />
      </button>
      <button
        className={sidebar === 'git' && sidebarShown ? 'selected' : ''}
        title='Source control'
        onClick={handleSourceControlClick}
      >
        <GitBranch size={20} />
        {!!git?.changes.length && <span className='activity-badge'>{git.changes.length}</span>}
      </button>
      <span className='activity-separator' />
      <button
        className={terminalFull ? 'selected' : ''}
        title='Focus terminals'
        onClick={handleFocusTerminalsClick}
      >
        <TerminalSquare size={20} />
      </button>
      <span className='spacer' />
      <button title='Keyboard shortcuts and help' onClick={handleKeyboardShortcutsAndHelpClick}>
        <CircleHelp size={19} />
      </button>
      <button title='Appearance settings' onClick={handleAppearanceSettingsClick}>
        <Settings2 size={19} />
      </button>
      <span className='avatar' title='Emdeck by Erdos Miller'>
        <img src='/emdeck.svg' alt='EM' />
      </span>
    </nav>
  );
}
