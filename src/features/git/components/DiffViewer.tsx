import { FileDiff, FilePenLine, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../platform/desktop/api';
import type { BranchComparison, DiffTab } from '../../../shared/contracts/workspace';
import { shortRef } from '../services/references';
export default function DiffViewer({
  root,
  tab,
  active,
  gitRevision,
  onOpen,
  onRefresh,
}: {
  root: string;
  tab: DiffTab;
  active: boolean;
  gitRevision: number;
  onOpen: () => void;
  onRefresh: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [comparison, setComparison] = useState<BranchComparison | null>(null);
  const lines = useMemo(
    () =>
      text?.split('\n').map((line, index) => (
        <div
          key={index}
          className={
            line.startsWith('+') && !line.startsWith('+++')
              ? 'diff-add'
              : line.startsWith('-') && !line.startsWith('---')
                ? 'diff-remove'
                : line.startsWith('@@')
                  ? 'diff-hunk'
                  : ''
          }
        >
          {line || ' '}
        </div>
      )),
    [text]
  );
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    const request = tab.comparison
      ? api
          .compare(root, tab.comparison.base, tab.comparison.head, tab.comparison.working)
          .then(result => {
            if (!cancelled) setComparison(result);
            return result.diff;
          })
      : api.diff(root, tab.path, tab.staged);
    void request
      .then(result => {
        if (!cancelled) setText(result);
      })
      .catch(reason => {
        if (!cancelled) setError(String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [root, tab.path, tab.staged, tab.revision, tab.comparison, active, gitRevision]);
  return (
    <section
      className='diff-document'
      aria-label={`${tab.comparison ? 'Branch comparison' : tab.staged ? 'Staged' : 'Working'} diff: ${tab.path}`}
      hidden={!active}
    >
      <div className='diff-toolbar'>
        <FileDiff size={15} />
        <strong>
          {tab.comparison ? 'Branch comparison' : tab.staged ? 'Staged changes' : 'Working changes'}
        </strong>
        <span className='diff-path' title={tab.path}>
          {tab.path}
        </span>
        <span className='spacer' />
        {!tab.comparison && (
          <button className='button secondary' onClick={onOpen}>
            <FilePenLine size={13} />
            Open in editor
          </button>
        )}
      </div>
      <div className='diff-caption'>
        <span>
          {tab.comparison
            ? `${shortRef(tab.comparison.base)} → ${tab.comparison.working ? 'Working tree · Saved tracked files (includes staged changes; excludes untracked files and unsaved editor edits)' : shortRef(tab.comparison.head)}`
            : `${tab.staged ? 'HEAD → Index' : 'Index → Working tree'} · Read-only comparison of saved changes`}
        </span>
        {loading && <span role='status'>Loading diff…</span>}
      </div>
      {tab.comparison && !tab.comparison.working && comparison && !error && (
        <div className='comparison-history'>
          {(['left', 'right'] as const).map(side => (
            <details key={side}>
              <summary>
                {side === 'left' ? comparison.leftCount : comparison.rightCount} commits only in{' '}
                {shortRef(side === 'left' ? tab.comparison!.base : tab.comparison!.head)}
              </summary>
              <div>
                {comparison[side].map(commit => (
                  <p key={commit.hash}>
                    <code>{commit.hash}</code> {commit.subject}
                    <small>{commit.age}</small>
                  </p>
                ))}
                {comparison[side].length === 0 && <p>No unique commits.</p>}
                {(side === 'left' ? comparison.leftCount : comparison.rightCount) > 50 && (
                  <p>Showing the latest 50 commits.</p>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
      {error ? (
        <div className='diff-message' role='alert'>
          <p>{error}</p>
          <button className='button secondary' onClick={onRefresh}>
            <RefreshCw size={13} />
            Retry
          </button>
        </div>
      ) : text ? (
        <pre className='diff-view' tabIndex={0} aria-label='Diff contents' aria-busy={loading}>
          {lines}
        </pre>
      ) : (
        !loading && (
          <div className='diff-message'>
            <FileDiff size={28} />
            <h3>No text changes</h3>
            <p>
              {tab.comparison
                ? 'No text differences between these versions.'
                : `There are no ${tab.staged ? 'staged' : 'working'} text changes for this file.`}
            </p>
          </div>
        )
      )}
    </section>
  );
}
