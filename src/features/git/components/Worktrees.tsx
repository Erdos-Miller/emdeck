import { FolderOpen, GitBranch, GitFork, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, native } from '../../../platform/desktop/api';
import type { GitSnapshot, Project, Worktree } from '../../../shared/contracts/workspace';
import { basename } from '../../../shared/lib/paths';
interface Props {
  project: Project;
  seed?: {
    reference: string;
    revision: number;
  } | null;
  git: GitSnapshot | null;
  active: boolean;
  gitRevision: number;
  onChanged: () => void;
  onOpen: (path: string) => Promise<void>;
  onConfirmRemove: (path: string) => Promise<boolean>;
}
function location(root: string, name: string) {
  const separator = root.includes('\\') ? '\\' : '/';
  const parent = root.slice(0, Math.max(root.lastIndexOf('/'), root.lastIndexOf('\\')));
  const folder =
    name
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^\.+/, '') || 'agent';
  return `${parent}${separator}${basename(root)}-${folder}`;
}
export default function Worktrees({
  project,
  seed,
  git,
  active,
  gitRevision,
  onChanged,
  onOpen,
  onConfirmRemove,
}: Props) {
  const handleRefreshWorktreesClick = () => {
    void refresh();
    onChanged();
  };
  const handleCreatingClick = () => {
    setCreating(true);
    setError('');
    setNotice('');
  };
  const handleSubmit: React.ComponentProps<'form'>['onSubmit'] = event => {
    event.preventDefault();
    if (allowed) void create();
  };
  const handleModeChange: React.ComponentProps<'select'>['onChange'] = e => setMode(e.target.value);
  const handleBranchChange: React.ComponentProps<'input'>['onChange'] = e =>
    setBranch(e.target.value);
  const handleStartFromChange: React.ComponentProps<'select'>['onChange'] = e =>
    setStartPoint(e.target.value);
  const handleExistingChange: React.ComponentProps<'select'>['onChange'] = e =>
    setExisting(e.target.value);
  const handleDestinationFolderChange: React.ComponentProps<'input'>['onChange'] = e =>
    setDestination(e.target.value);
  const handleChooseParentFolderClick = () => void browse();
  const handleOpenAfterChange: React.ComponentProps<'input'>['onChange'] = e =>
    setOpenAfter(e.target.checked);
  const handleCreatingClick2 = () => setCreating(false);
  const [items, setItems] = useState<Worktree[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState('new');
  const [branch, setBranch] = useState('');
  const [existing, setExisting] = useState('');
  const [startPoint, setStartPoint] = useState('HEAD');
  const [destination, setDestination] = useState<string | null>(null);
  const [openAfter, setOpenAfter] = useState(true);
  useEffect(() => {
    if (!seed) return;
    setStartPoint(seed.reference);
    setMode('new');
    setBranch('');
    setDestination(null);
    setCreating(true);
    setError('');
  }, [seed]);
  const sequence = useRef(0);
  const alive = useRef(true);
  const operation = useRef(false);
  useEffect(() => {
    alive.current = true;
    const requests = sequence;
    return () => {
      alive.current = false;
      requests.current++;
    };
  }, []);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    try {
      const result = await api.worktrees(project.root);
      if (alive.current && request === sequence.current) {
        setItems(result);
        setListError('');
      }
    } catch (e) {
      if (alive.current && request === sequence.current)
        setListError(String(e).replace(/^Error: /, ''));
    } finally {
      if (alive.current && request === sequence.current) setLoading(false);
    }
  }, [project.root]);
  useEffect(() => {
    if (active) void refresh();
  }, [active, gitRevision, refresh]);
  const name = mode === 'new' ? branch.trim() : existing;
  const path = destination ?? location(project.root, name);
  const occupied = new Set(items?.map(item => item.branch).filter(Boolean));
  const allowed = name && (mode === 'new' || !occupied.has(name)) && path.trim();
  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      if (alive.current) setError(String(e).replace(/^Error: /, ''));
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const create = () =>
    run(async () => {
      const added = await api.createWorktree(project.root, {
        path: path.trim(),
        branch: name,
        newBranch: mode === 'new',
        startPoint,
      });
      if (!alive.current) return;
      setCreating(false);
      setBranch('');
      setExisting('');
      setDestination(null);
      setNotice(`Created ${added}`);
      await refresh();
      onChanged();
      if (openAfter && alive.current) {
        try {
          await onOpen(added);
          if (alive.current) await refresh();
        } catch (e) {
          throw new Error(
            `Worktree created, but its window could not open: ${String(e)}. Use Open in new window below to retry.`
          );
        }
      }
    });
  const remove = (item: Worktree) =>
    run(async () => {
      if (!(await onConfirmRemove(item.path)) || !alive.current) return;
      await api.removeWorktree(project.root, item.path);
      if (!alive.current) return;
      setNotice(`Removed ${item.path}. The branch was kept.`);
      await refresh();
      onChanged();
    });
  const browse = () =>
    run(async () => {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const parent = await open({
        directory: true,
        multiple: false,
        title: 'Choose a parent folder for the new worktree',
      });
      if (typeof parent === 'string' && alive.current) {
        const separator = parent.includes('\\') ? '\\' : '/';
        setDestination(`${parent.replace(/[\\/]+$/, '')}${separator}${basename(path)}`);
      }
    });
  return (
    <section className='worktrees-document' hidden={!active} aria-label='Git worktrees'>
      <header className='diff-toolbar'>
        <GitFork size={17} />
        <strong>Worktrees</strong>
        <span className='diff-path'>{project.name}</span>
        <span className='spacer' />
        <button
          className='icon-button'
          title='Refresh worktrees'
          disabled={busy || loading}
          onClick={handleRefreshWorktreesClick}
        >
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
        </button>
        <button
          className='button primary'
          disabled={busy || !items || !git?.available}
          onClick={handleCreatingClick}
        >
          <Plus size={14} />
          New worktree
        </button>
      </header>
      <div className='worktrees-body'>
        <p className='worktrees-intro'>
          Give each agent its own branch and project folder. Open worktrees in separate windows to
          keep your current files and terminals in place.
        </p>
        {(error || listError) && (
          <div className='worktree-feedback' role='alert'>
            {error || listError}
          </div>
        )}
        {notice && (
          <div className='worktree-feedback success' role='status'>
            {notice}
          </div>
        )}
        {creating && (
          <form className='worktree-form' onSubmit={handleSubmit}>
            <h3>Create a worktree</h3>
            <fieldset disabled={busy}>
              <label className='field'>
                Branch mode
                <select value={mode} onChange={handleModeChange}>
                  <option value='new'>Create a new branch</option>
                  <option value='existing'>Use an existing local branch</option>
                </select>
              </label>
              {mode === 'new' ? (
                <>
                  <label className='field'>
                    New branch name
                    <input
                      autoFocus
                      required
                      autoComplete='off'
                      placeholder='agent/my-feature'
                      value={branch}
                      onChange={handleBranchChange}
                    />
                  </label>
                  <label className='field'>
                    Start from
                    <select
                      aria-label='Start from'
                      value={startPoint}
                      onChange={handleStartFromChange}
                    >
                      <option value='HEAD'>Current HEAD ({git?.branch})</option>
                      <optgroup label='Local branches'>
                        {git?.localBranches.map(b => (
                          <option key={b} value={`refs/heads/${b}`}>
                            {b}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label='Remote branches · last fetch'>
                        {git?.remoteBranches.map(b => (
                          <option key={b} value={`refs/remotes/${b}`}>
                            {b}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                </>
              ) : (
                <label className='field'>
                  Local branch
                  <select required value={existing} onChange={handleExistingChange}>
                    <option value=''>Choose a branch…</option>
                    {git?.localBranches.map(b => (
                      <option key={b} value={b} disabled={occupied.has(b)}>
                        {b}
                        {occupied.has(b) ? ' — already in a worktree' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className='field worktree-destination'>
                Destination folder
                <div className='worktree-path-input'>
                  <input
                    aria-label='Destination folder'
                    required
                    value={path}
                    onChange={handleDestinationFolderChange}
                  />
                  {native && (
                    <button
                      type='button'
                      className='button secondary'
                      title='Choose parent folder'
                      onClick={handleChooseParentFolderClick}
                    >
                      <FolderOpen size={14} />
                      Browse…
                    </button>
                  )}
                </div>
              </label>
              <p className='worktree-form-hint'>
                Choose a new folder inside an existing parent, outside other worktrees. Only
                committed files are checked out; current edits stay in this project.
              </p>
              <label className='worktree-checkbox'>
                <input type='checkbox' checked={openAfter} onChange={handleOpenAfterChange} />
                Open in a new window after creating
              </label>
            </fieldset>
            <footer>
              <button
                type='button'
                className='button secondary'
                disabled={busy}
                onClick={handleCreatingClick2}
              >
                Cancel
              </button>
              <button className='button primary' type='submit' disabled={busy || !allowed}>
                {busy ? 'Creating…' : 'Create worktree'}
              </button>
            </footer>
          </form>
        )}
        <div className='worktree-list-heading'>
          PROJECT FOLDERS <span>{items?.length ?? '…'}</span>
        </div>
        {!items && !error && !listError && <p className='empty-caption'>Reading worktrees…</p>}
        {items?.map(item => {
          const handleOpenClick = () =>
            void run(async () => {
              await onOpen(item.path);
              if (alive.current) {
                setNotice(`Opened ${item.path} in a new window.`);
                await refresh();
              }
            });
          const handleClick = () => void remove(item);
          return (
            <article
              className={`worktree-card ${item.current ? 'current' : ''}`}
              key={item.path}
              aria-label={item.path}
            >
              <div className='worktree-card-title'>
                <GitBranch size={16} />
                <strong>
                  {item.bare
                    ? 'Bare repository'
                    : item.branch || `Detached HEAD · ${item.head.slice(0, 8)}`}
                </strong>
                {item.main && <span>Main</span>}
                {item.current ? (
                  <span className='worktree-current'>This window</span>
                ) : (
                  item.open && <span>Open in Emdeck</span>
                )}
                {item.locked !== null && <span title={item.locked}>Locked</span>}
                {item.missing && <span>Missing folder</span>}
                {item.prunable !== null && <span title={item.prunable}>Prunable</span>}
              </div>
              <p className='worktree-path'>{item.path}</p>
              {item.missing && (
                <p className='empty-caption'>
                  Restore this folder, or use git worktree prune in a terminal to clean up its
                  registration.
                </p>
              )}
              <div className='worktree-card-actions'>
                {!item.current && !item.bare && (
                  <button
                    className='button secondary'
                    disabled={busy || item.missing}
                    onClick={handleOpenClick}
                  >
                    <FolderOpen size={13} />
                    Open in new window
                  </button>
                )}
                {!item.main && !item.current && !item.bare && (
                  <button
                    className='button secondary danger-text'
                    disabled={busy || item.open || item.missing || item.locked !== null}
                    title={
                      item.open
                        ? 'Close this worktree’s Emdeck window first'
                        : item.locked !== null
                          ? 'Unlock this worktree in Git first'
                          : 'Remove worktree folder; keep its branch'
                    }
                    onClick={handleClick}
                  >
                    <Trash2 size={13} />
                    Remove…
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
