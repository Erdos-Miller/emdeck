import {
  ArrowRight,
  ChevronRight,
  Code2,
  FolderOpen,
  GitMerge,
  TerminalSquare,
  Zap,
} from 'lucide-react';
import { lazy, Suspense } from 'react';
import { resolveConflict } from '../../features/git/services/conflicts';
import { native } from '../../platform/desktop/api';
import { FileIcon } from '../../shared/ui/FileIcon';
import type { WorkspaceController } from '../hooks/useWorkspace';
const DocumentView = lazy(() => import('../../features/editor/components/DocumentView'));
const mod = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';
type Props = {
  model: Pick<
    WorkspaceController,
    | 'activeDiff'
    | 'worktreesActive'
    | 'file'
    | 'project'
    | 'reloadFile'
    | 'activeConflicts'
    | 'changeFile'
    | 'openFile'
    | 'settings'
    | 'changeCursor'
    | 'saveFile'
    | 'fail'
    | 'files'
    | 'openProject'
    | 'addPane'
    | 'recent'
  >;
};
export default function EditorContent({ model }: Props) {
  const handleClick = () => void reloadFile();
  const handleOpenFile: React.ComponentProps<typeof DocumentView>['onOpenFile'] = path =>
    openFile(path);
  const handleSave = () => void saveFile().catch(fail);
  const handleClick2 = () => void openProject();
  const handleClick3 = () => addPane('Terminal');
  const {
    activeDiff,
    worktreesActive,
    file,
    project,
    reloadFile,
    activeConflicts,
    changeFile,
    openFile,
    settings,
    changeCursor,
    saveFile,
    fail,
    files,
    openProject,
    addPane,
    recent,
  } = model;
  return (
    <div className='file-document' hidden={Boolean(activeDiff) || worktreesActive}>
      {file ? (
        <>
          <div className='breadcrumbs'>
            <span>{project?.name}</span>
            {file.path.split('/').map((part, i) => (
              <span key={i}>
                <ChevronRight size={11} />
                {i === file.path.split('/').length - 1 && <FileIcon path={file.path} />}
                {part}
              </span>
            ))}
            <span className='spacer' />
            <span className='editor-mode'>
              {file.content !== file.saved ? 'Unsaved changes' : 'All changes saved'}
            </span>
          </div>
          {file.external && (
            <div className='external-banner'>
              <span>
                This file changed on disk. Reload to view the latest version; unsaved edits are
                protected.
              </span>
              <button onClick={handleClick}>Reload file</button>
            </div>
          )}
          {activeConflicts.length > 0 && (
            <div className='conflict-tools'>
              <GitMerge size={15} />
              <strong>
                {activeConflicts.length} conflict{activeConflicts.length > 1 ? 's' : ''}
              </strong>
              <span>Resolve first conflict:</span>
              {(['ours', 'theirs', 'both'] as const).map(choice => {
                const handleClick = () =>
                  changeFile(file.path, resolveConflict(file.content, activeConflicts[0], choice));
                return (
                  <button key={choice} onClick={handleClick}>
                    Accept {choice}
                  </button>
                );
              })}
              <small>Then save and stage.</small>
            </div>
          )}
          <Suspense fallback={<div className='loading'>Opening editor…</div>}>
            <DocumentView
              key={project?.root}
              root={project?.root ?? ''}
              onOpenFile={handleOpenFile}
              file={file}
              settings={settings}
              onChange={changeFile}
              onCursor={changeCursor}
              onSave={handleSave}
              openPaths={files.map(f => f.path)}
            />
          </Suspense>
        </>
      ) : (
        <div className='welcome'>
          <div className='welcome-eyebrow'>
            <span /> YOUR NEXT IDEA STARTS HERE
          </div>
          <h1>
            Your code. Your agents.
            <br />
            <span>One workspace.</span>
          </h1>
          <p>
            A development workspace by Erdos Miller.
            <br />
            Open a project, bring your agents, and make something.
          </p>
          <div className='welcome-actions'>
            <button className='button primary' onClick={handleClick2}>
              <FolderOpen size={16} />
              Open a project<kbd>{mod} O</kbd>
            </button>
            {project && (
              <button className='button secondary' onClick={handleClick3}>
                <TerminalSquare size={16} />
                Start a terminal
              </button>
            )}
          </div>
          {recent.length > 0 && native && (
            <div className='recent-projects'>
              <h3>RECENT WORKSPACES</h3>
              {recent.map(p => {
                const handleClick = () => void openProject(p.root);
                return (
                  <button key={p.root} onClick={handleClick}>
                    <FolderOpen size={15} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>{p.root.replace(/^\\\\\?\\/, '')}</small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                );
              })}
            </div>
          )}
          <div className='welcome-principles'>
            <span>
              <Zap size={14} />
              No indexing
            </span>
            <span>
              <TerminalSquare size={14} />
              Your agents, your terminals
            </span>
            <span>
              <Code2 size={14} />
              Just enough IDE
            </span>
          </div>
          <div className='welcome-watermark' aria-hidden='true'>
            v.
          </div>
        </div>
      )}
    </div>
  );
}
