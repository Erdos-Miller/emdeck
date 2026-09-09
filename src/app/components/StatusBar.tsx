import { GitBranch, PanelLeftClose, Zap } from 'lucide-react';
import { native } from '../../platform/desktop/api';
import { fileKind } from '../../shared/lib/paths';
import type { WorkspaceController } from '../hooks/useWorkspace';
type Props = {
  model: Pick<
    WorkspaceController,
    | 'setBranchMenu'
    | 'git'
    | 'project'
    | 'connectedPanes'
    | 'worktreesActive'
    | 'activeDiff'
    | 'file'
    | 'cursor'
    | 'toggleSidebar'
  >;
};
export default function StatusBar({ model }: Props) {
  const handleBranchMenuClick = () => {
    setBranchMenu(s => !s);
  };
  const {
    setBranchMenu,
    git,
    project,
    connectedPanes,
    worktreesActive,
    activeDiff,
    file,
    cursor,
    toggleSidebar,
  } = model;
  return (
    <footer className='statusbar'>
      <span className='status-brand'>
        <Zap size={12} />
        EMDECK
      </span>
      <button onClick={handleBranchMenuClick}>
        <GitBranch size={12} />
        {git?.available
          ? git.branch
          : project
            ? native
              ? 'No Git repository'
              : 'Preview workspace'
            : 'No workspace'}
      </button>
      {git?.available && (
        <span>{git.changes.length ? `${git.changes.length} changes` : 'Clean working tree'}</span>
      )}
      <span className='spacer' />
      <span className='status-idle'>
        <i />
        {native
          ? connectedPanes
            ? `${connectedPanes} terminals connected`
            : 'Ready when you are'
          : 'Browser preview'}
      </span>
      <span className='status-divider' />
      <span>
        {worktreesActive
          ? 'Git worktrees'
          : activeDiff
            ? 'Read-only diff'
            : file
              ? `Ln ${cursor.line}, Col ${cursor.column}`
              : 'No background indexing'}
      </span>
      {file && !activeDiff && !worktreesActive && (
        <>
          <span>{file.content.includes('\r\n') ? 'CRLF' : 'LF'}</span>
          <span>UTF-8</span>
          <span>{fileKind(file.path)}</span>
        </>
      )}
      <button title='Toggle sidebar' onClick={toggleSidebar}>
        <PanelLeftClose size={13} />
      </button>
    </footer>
  );
}
