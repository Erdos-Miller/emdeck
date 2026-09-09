import {
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Folder,
  FolderOpen,
  GitBranch,
  GitFork,
} from 'lucide-react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { BranchDetail, GitSnapshot } from '../../../shared/contracts/workspace';
import type { BranchNode } from '../services/branchTree';
import { shortRef } from '../services/references';
import { BranchStatus } from './BranchStatus';
interface Props {
  git: GitSnapshot;
  busy: boolean;
  local: BranchNode[];
  remote: BranchNode[];
  query: string;
  expanded: Record<string, boolean>;
  selected: string | null;
  id: string;
  currentRef: string;
  details: Map<string, BranchDetail>;
  setSelected: Dispatch<SetStateAction<string | null>>;
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>;
  select: (reference: string, focus?: boolean) => void;
  hoverTimer: RefObject<ReturnType<typeof setTimeout> | undefined>;
}
export default function BranchTree({
  git,
  busy,
  local,
  remote,
  query,
  expanded,
  selected,
  id,
  currentRef,
  details,
  setSelected,
  setExpanded,
  select,
  hoverTimer,
}: Props) {
  function renderNodes(nodes: BranchNode[], scope: 'local' | 'remote', depth = 0) {
    return nodes.map(node => {
      const handleClick = () => select(reference);
      const handleTimeoutPointerEnter: React.ComponentProps<'button'>['onPointerEnter'] = event => {
        if (selected && selected !== reference && event.pointerType === 'mouse' && !busy) {
          clearTimeout(hoverTimer.current);
          hoverTimer.current = setTimeout(() => select(reference, false), 250);
        }
      };
      const handlePointerLeave = () => clearTimeout(hoverTimer.current);
      const handleKeyDown: React.ComponentProps<'button'>['onKeyDown'] = event => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          event.stopPropagation();
          select(reference);
        }
      };
      const handleContextMenu: React.ComponentProps<'button'>['onContextMenu'] = e => {
        e.preventDefault();
        select(reference);
      };
      const key = `${scope}:${node.path}`;
      const indent = { paddingLeft: 8 + depth * 16 };
      if (node.children.length) {
        const open =
          expanded[key] ??
          (Boolean(query.trim()) ||
            depth === 0 ||
            (scope === 'local' && Boolean(git?.branch.startsWith(`${node.path}/`))));
        const handleToggleFolder = () => {
          setSelected(null);
          setExpanded(old => ({ ...old, [key]: !open }));
        };
        return (
          <li key={node.path}>
            <button
              className='branch-folder'
              style={indent}
              title={node.path}
              aria-label={`${scope === 'local' ? 'Local' : 'Remote'} folder ${node.path}`}
              aria-expanded={open}
              aria-controls={`${id}-${key}`}
              onClick={handleToggleFolder}
            >
              {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {open ? <FolderOpen size={14} /> : <Folder size={14} />}
              <span>{node.name}</span>
            </button>
            <ul id={`${id}-${key}`} hidden={!open}>
              {renderNodes(node.children, scope, depth + 1)}
            </ul>
          </li>
        );
      }
      const reference = `refs/${scope === 'local' ? 'heads' : 'remotes'}/${node.path}`;
      const current = reference === currentRef;
      const detail = details.get(reference);
      return (
        <li
          className={`branch-row ${current ? 'current' : ''} ${selected === reference ? 'selected' : ''}`}
          key={node.path}
          style={indent}
        >
          <button
            id={`${id}-${reference}`}
            disabled={busy}
            aria-label={`Actions for ${scope} branch ${node.path}`}
            aria-haspopup='menu'
            aria-expanded={selected === reference}
            aria-controls={selected === reference ? `${id}-actions` : undefined}
            title={`${node.path}${detail?.upstream ? ` → ${shortRef(detail.upstream)}` : ''}`}
            onClick={handleClick}
            onPointerEnter={handleTimeoutPointerEnter}
            onPointerLeave={handlePointerLeave}
            onKeyDown={handleKeyDown}
            onContextMenu={handleContextMenu}
          >
            {current ? <Check size={14} /> : <GitBranch size={14} />}
            <span className='branch-name'>{node.name}</span>
            <BranchStatus branch={detail} />
            {current ? (
              <small>current</small>
            ) : detail?.worktree ? (
              <GitFork size={12} aria-label='Checked out in a worktree' />
            ) : null}
            <ChevronRight size={12} />
          </button>
        </li>
      );
    });
  }
  function renderSection(scope: 'local' | 'remote', nodes: BranchNode[], count: number) {
    const handleSelectedClick = () => {
      setSelected(null);
      setExpanded(old => ({ ...old, [scope]: !open }));
    };
    const label = scope === 'local' ? 'Local branches' : 'Remote branches';
    const open = expanded[scope] ?? true;
    return (
      <section aria-label={label} className='branch-section'>
        <h3>
          <button
            aria-label={label}
            aria-expanded={open}
            aria-controls={`${id}-${scope}-branches`}
            onClick={handleSelectedClick}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {scope === 'local' ? <GitBranch size={13} /> : <Cloud size={13} />}
            {label}
            <span>{count}</span>
          </button>
        </h3>
        <div id={`${id}-${scope}-branches`} hidden={!open}>
          {nodes.length ? (
            <ul>{renderNodes(nodes, scope)}</ul>
          ) : (
            <p className='branch-empty'>
              {query.trim()
                ? `No matching ${scope} branches.`
                : scope === 'local'
                  ? 'No local branches yet.'
                  : 'No remote branches fetched yet.'}
            </p>
          )}
        </div>
      </section>
    );
  }
  return (
    <>
      {renderSection('local', local, git.localBranches.length)}
      {renderSection('remote', remote, git.remoteBranches.length)}
    </>
  );
}
