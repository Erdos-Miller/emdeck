import {
  Check,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  Minus,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useState } from 'react';
import type { Change, GitSnapshot } from '../../../shared/contracts/workspace';
import { basename } from '../../../shared/lib/paths';
import { FileIcon } from '../../../shared/ui/FileIcon';
import { BranchStatus } from './BranchStatus';
interface Props {
  git: GitSnapshot | null;
  busy: boolean;
  onRefresh: () => void;
  onAction: (action: string, value: string, original?: string | null) => Promise<void>;
  onBranchAction: (action: string) => void;
  onOpen: (path: string) => void;
  onDiff: (path: string, staged: boolean) => void;
  onBranches: () => void;
  onWorktrees: () => void;
}
export default function GitPanel({
  git,
  busy,
  onRefresh,
  onAction,
  onBranchAction,
  onOpen,
  onDiff,
  onBranches,
  onWorktrees,
}: Props) {
  const handleBranchActionClick = () => onBranchAction('fetch');
  const handleBranchActionClick2 = () => onBranchAction('push');
  const handleBranchActionClick3 = () => onBranchAction('continue');
  const handleBranchActionClick4 = () => onBranchAction('abort');
  const handleActionSubmit: React.ComponentProps<'form'>['onSubmit'] = e => {
    e.preventDefault();
    void onAction('commit', message)
      .then(() => setMessage(''))
      .catch(() => {});
  };
  const handleCommitMessageChange: React.ComponentProps<'textarea'>['onChange'] = e =>
    setMessage(e.target.value);
  const [message, setMessage] = useState('');
  const staged = git?.changes.filter(c => ![' ', '?'].includes(c.index) && !c.conflict) ?? [];
  const working = git?.changes.filter(c => c.working !== ' ' || c.index === '?') ?? [];
  const render = (change: Change, isStaged: boolean) => {
    const handleOpenClick = () =>
      change.conflict || change.index === '?' ? onOpen(change.path) : onDiff(change.path, isStaged);
    const handleOpenFileClick = () => onOpen(change.path);
    const handleActionClick = () =>
      void onAction(isStaged ? 'unstage' : 'stage', change.path, change.originalPath);
    return (
      <div className='change-row' key={change.path}>
        <button className='change-file' title={change.path} onClick={handleOpenClick}>
          <FileIcon path={change.path} />
          <span className='truncate'>{basename(change.path)}</span>
          <span className={`git-letter ${change.conflict ? 'conflict' : ''}`}>
            {change.conflict
              ? '!'
              : isStaged
                ? change.index
                : change.working === '?'
                  ? 'U'
                  : change.working}
          </span>
        </button>
        <button className='icon-button' title='Open file' onClick={handleOpenFileClick}>
          <FileDiff size={13} />
        </button>
        <button
          disabled={busy}
          className='icon-button'
          title={
            isStaged ? 'Unstage file' : change.conflict ? 'Mark resolved by staging' : 'Stage file'
          }
          onClick={handleActionClick}
        >
          {isStaged ? <Minus size={13} /> : <Plus size={13} />}
        </button>
      </div>
    );
  };
  return (
    <>
      <div className='sidebar-heading'>
        <span>SOURCE CONTROL</span>
        <span className='spacer' />
        <button disabled={busy} className='icon-button' title='Refresh Git' onClick={onRefresh}>
          <RefreshCw size={14} className={busy ? 'spinning' : ''} />
        </button>
      </div>
      {!git?.available ? (
        <div className='sidebar-empty'>
          <GitBranch size={28} />
          <h3>{git ? 'Your repository, connected.' : 'Reading repository…'}</h3>
          <p>{git?.message || 'Git runs only when needed.'}</p>
        </div>
      ) : (
        <div className='git-content'>
          <button className='git-current' onClick={onBranches}>
            <GitBranch size={16} />
            <strong>{git.branch}</strong>
            <BranchStatus
              branch={git.branchDetails?.find(b => b.reference === `refs/heads/${git.branch}`)}
            />
            <span>Manage</span>
          </button>
          <div className='git-sync-actions'>
            <button
              className='button secondary'
              disabled={busy || !git.remotes?.length}
              onClick={handleBranchActionClick}
            >
              Fetch
            </button>
            <button
              className='button secondary'
              disabled={
                busy ||
                Boolean(git.operation) ||
                !git.remotes?.length ||
                !git.localBranches.includes(git.branch)
              }
              onClick={handleBranchActionClick2}
            >
              Push…
            </button>
          </div>
          {git.operation && (
            <div className='git-operation' role='status'>
              <strong>{git.operation} in progress</strong>
              <p>Resolve conflicted files, save and stage them, then continue.</p>
              <div className='git-sync-actions'>
                <button
                  className='button primary'
                  disabled={busy || git.changes.some(c => c.conflict)}
                  onClick={handleBranchActionClick3}
                >
                  Continue {git.operation}
                </button>
                <button
                  className='button secondary'
                  disabled={busy}
                  onClick={handleBranchActionClick4}
                >
                  Abort…
                </button>
              </div>
            </div>
          )}
          <button className='git-worktrees' onClick={onWorktrees}>
            <GitFork size={15} />
            Worktrees<span>Manage</span>
          </button>
          <form className='commit-form' onSubmit={handleActionSubmit}>
            <textarea
              aria-label='Commit message'
              placeholder='Message for your next commit…'
              value={message}
              onChange={handleCommitMessageChange}
              rows={3}
            />
            <button
              type='submit'
              className='button primary'
              disabled={busy || Boolean(git.operation) || !staged.length || !message.trim()}
            >
              <Check size={14} />
              Commit staged changes
            </button>
          </form>
          <div className='git-group-title'>
            STAGED CHANGES<span>{staged.length}</span>
          </div>
          {staged.map(c => render(c, true))}
          {!staged.length && <p className='empty-caption'>Stage files to prepare a commit.</p>}
          <div className='git-group-title'>
            CHANGES<span>{working.length}</span>
          </div>
          {working.map(c => render(c, false))}
          {!working.length && <p className='empty-caption'>Working tree is clean.</p>}
          <div className='git-group-title history-title'>RECENT COMMITS</div>
          {git.commits.map(c => (
            <div className='commit-item' key={c.hash}>
              <GitCommitHorizontal size={14} />
              <div>
                <strong>{c.subject}</strong>
                <small>
                  <code>{c.hash}</code> · {c.age}
                </small>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
