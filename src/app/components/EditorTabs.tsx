import {
  ArrowDownToLine,
  FileDiff,
  FolderOpen,
  GitFork,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { basename } from '../../shared/lib/paths';
import { FileIcon } from '../../shared/ui/FileIcon';
import type { WorkspaceController } from '../hooks/useWorkspace';
type Props = {
  model: Pick<
    WorkspaceController,
    | 'files'
    | 'worktreesActive'
    | 'activeDiffId'
    | 'active'
    | 'setActive'
    | 'setActiveDiffId'
    | 'setWorktreesActive'
    | 'closeFile'
    | 'diffTabs'
    | 'closeDiff'
    | 'worktreesOpen'
    | 'showWorktrees'
    | 'closeWorktrees'
    | 'openProject'
    | 'file'
    | 'activeDiff'
    | 'saveCurrentFile'
    | 'fail'
    | 'refreshDiff'
    | 'reloadFile'
  >;
};
export default function EditorTabs({ model }: Props) {
  const handleOpenFolderClick = () => void openProject();
  const handleSaveCurrentFileClick = () => void saveCurrentFile().catch(fail);
  const handleClick = () => (activeDiff ? refreshDiff(activeDiff.id) : void reloadFile());
  const {
    files,
    worktreesActive,
    activeDiffId,
    active,
    setActive,
    setActiveDiffId,
    setWorktreesActive,
    closeFile,
    diffTabs,
    closeDiff,
    worktreesOpen,
    showWorktrees,
    closeWorktrees,
    openProject,
    file,
    activeDiff,
    saveCurrentFile,
    fail,
    refreshDiff,
    reloadFile,
  } = model;
  return (
    <div className='editor-tabs'>
      <div className='tab-list' role='tablist' aria-label='Open files'>
        {files.length > 0 &&
          files.map(f => {
            const handleActiveClick = () => {
              setActive(f.path);
              setActiveDiffId(null);
              setWorktreesActive(false);
            };
            const handleClick = () => void closeFile(f.path);
            return (
              <div
                key={f.path}
                className={`editor-tab ${!worktreesActive && !activeDiffId && active === f.path ? 'active' : ''}`}
              >
                <button
                  role='tab'
                  aria-selected={!worktreesActive && !activeDiffId && active === f.path}
                  onClick={handleActiveClick}
                  title={f.path}
                >
                  <FileIcon path={f.path} />
                  {basename(f.path)}
                  {f.content !== f.saved && <span className='unsaved-dot' aria-label='Unsaved' />}
                </button>
                <button
                  className='tab-close'
                  title={`Close ${basename(f.path)}`}
                  onClick={handleClick}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        {diffTabs.map(tab => {
          const handleActiveDiffIdClick = () => {
            setActiveDiffId(tab.id);
            setWorktreesActive(false);
          };
          const handleClick = () => closeDiff(tab.id);
          return (
            <div
              key={tab.id}
              className={`editor-tab diff-tab ${!worktreesActive && activeDiffId === tab.id ? 'active' : ''}`}
            >
              <button
                role='tab'
                aria-selected={!worktreesActive && activeDiffId === tab.id}
                title={`${tab.path} — ${tab.comparison ? 'Comparison' : tab.staged ? 'Staged' : 'Working'} diff`}
                onClick={handleActiveDiffIdClick}
              >
                <FileDiff size={13} />
                {tab.comparison ? tab.path : basename(tab.path)}
                <span className='diff-tab-label'>
                  {tab.comparison ? 'Compare' : tab.staged ? 'Staged' : 'Working'}
                </span>
              </button>
              <button
                className='tab-close'
                title={`Close ${tab.comparison ? 'comparison' : tab.staged ? 'staged' : 'working'} diff: ${tab.path}`}
                onClick={handleClick}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
        {worktreesOpen && (
          <div className={`editor-tab ${worktreesActive ? 'active' : ''}`}>
            <button role='tab' aria-selected={worktreesActive} onClick={showWorktrees}>
              <GitFork size={13} />
              Worktrees
            </button>
            <button className='tab-close' title='Close Worktrees' onClick={closeWorktrees}>
              <X size={12} />
            </button>
          </div>
        )}
        {!files.length && !diffTabs.length && !worktreesOpen && (
          <div className='welcome-tab'>
            <Sparkles size={14} />
            Welcome
          </div>
        )}
      </div>
      <button className='icon-button' title='Open folder' onClick={handleOpenFolderClick}>
        <FolderOpen size={14} />
      </button>
      <button
        className='icon-button'
        title='Save current file'
        disabled={!file || Boolean(activeDiff) || worktreesActive}
        onClick={handleSaveCurrentFileClick}
      >
        <ArrowDownToLine size={14} />
      </button>
      <button
        className='icon-button'
        title={activeDiff ? 'Refresh diff' : 'Reload current file'}
        disabled={worktreesActive || (!file && !activeDiff)}
        onClick={handleClick}
      >
        <RefreshCw size={13} />
      </button>
    </div>
  );
}
