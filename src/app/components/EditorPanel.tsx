import { lazy, Suspense } from 'react';
import { api } from '../../platform/desktop/api';
import type { WorkspaceController } from '../hooks/useWorkspace';
import EditorContent from './EditorContent';
import EditorTabs from './EditorTabs';
const DiffViewer = lazy(() => import('../../features/git/components/DiffViewer'));
const Worktrees = lazy(() => import('../../features/git/components/Worktrees'));
type Props = {
  model: Pick<
    WorkspaceController,
    | 'terminalFull'
    | 'terminalVisible'
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
    | 'project'
    | 'activeConflicts'
    | 'changeFile'
    | 'openFile'
    | 'settings'
    | 'changeCursor'
    | 'saveFile'
    | 'addPane'
    | 'recent'
    | 'gitRevision'
    | 'worktreeSeed'
    | 'git'
    | 'refreshGit'
    | 'confirm'
  >;
};
export default function EditorPanel({ model }: Props) {
  const handleChanged = () => void refreshGit();
  const handleOpen: React.ComponentProps<typeof Worktrees>['onOpen'] = async path => {
    await api.openWindow(path);
  };
  const handleConfirmRemove: React.ComponentProps<typeof Worktrees>['onConfirmRemove'] = path =>
    confirm(
      'Remove worktree?',
      `Remove this folder and its files?\n${path}\n\nIts Git branch will be kept. Git refuses removal if tracked or untracked files have changes. Ignored files inside the folder will also be removed.`,
      'Remove worktree',
      true
    );
  const {
    terminalFull,
    terminalVisible,
    worktreesActive,
    activeDiffId,
    diffTabs,
    worktreesOpen,
    refreshDiff,
    project,
    openFile,
    gitRevision,
    worktreeSeed,
    git,
    refreshGit,
    confirm,
  } = model;
  return (
    <section className={`editor-panel ${terminalFull && terminalVisible ? 'hidden-panel' : ''}`}>
      <EditorTabs model={model} />
      <EditorContent model={model} />
      {project &&
        diffTabs.map(tab => {
          const handleOpen = () => void openFile(tab.path);
          const handleRefresh = () => refreshDiff(tab.id);
          return (
            <Suspense
              key={tab.id}
              fallback={
                !worktreesActive && activeDiffId === tab.id ? (
                  <div className='loading'>Opening diff…</div>
                ) : null
              }
            >
              <DiffViewer
                root={project.root}
                tab={tab}
                active={!worktreesActive && activeDiffId === tab.id}
                gitRevision={gitRevision}
                onOpen={handleOpen}
                onRefresh={handleRefresh}
              />
            </Suspense>
          );
        })}
      {project && worktreesOpen && (
        <Suspense
          fallback={worktreesActive ? <div className='loading'>Opening worktrees…</div> : null}
        >
          <Worktrees
            key={project.root}
            project={project}
            seed={worktreeSeed}
            git={git}
            active={worktreesActive}
            gitRevision={gitRevision}
            onChanged={handleChanged}
            onOpen={handleOpen}
            onConfirmRemove={handleConfirmRemove}
          />
        </Suspense>
      )}
    </section>
  );
}
