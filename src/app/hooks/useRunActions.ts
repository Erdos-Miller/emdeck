import type { RunConfig } from '../../shared/contracts/workspace';
import type { useTerminalActions } from './useTerminalActions';
import type { useWorkspaceState } from './useWorkspaceState';
type Dependencies = Pick<
  ReturnType<typeof useWorkspaceState>,
  'setRunsOpen' | 'ask' | 'runs' | 'settings'
> &
  Pick<ReturnType<typeof useTerminalActions>, 'addPane'>;
export function useRunActions({ setRunsOpen, ask, runs, settings, addPane }: Dependencies) {
  const editRun = async (run?: RunConfig) => {
    setRunsOpen(false);
    const custom = run?.source === 'custom';
    const data = await ask({
      title: custom
        ? 'Edit run configuration'
        : run
          ? 'Customize detected script'
          : 'New run configuration',
      description:
        run && !custom
          ? 'Save an independent copy in My commands. The detected script stays linked to package.json.'
          : 'Commands run only when you press Run. They use your configured shell.',
      fields: [
        {
          name: 'name',
          label: 'Name',
          value: run ? (custom ? run.name : `${run.name} (custom)`) : undefined,
          placeholder: 'Development server',
        },
        {
          name: 'command',
          label: 'Command',
          value: run?.command,
          placeholder: `${runs.discovery.runner ?? 'bun'} run dev`,
        },
        {
          name: 'cwd',
          label: 'Working directory',
          value: run?.cwd,
          placeholder: 'Relative to project root',
          optional: true,
        },
      ],
    });
    if (data) {
      const item: RunConfig = {
        id: custom ? run.id : crypto.randomUUID(),
        name: data.name,
        command: data.command,
        cwd: data.cwd,
        source: 'custom',
      };
      runs.save(item);
    }
    setRunsOpen(true);
  };
  const launchRun = (run: RunConfig) => {
    if (run.source === 'detected' && (!settings.detectRunScripts || runs.loading)) return;
    if (addPane(run.name, run.command, run.cwd)) {
      runs.remember(run.id);
      setRunsOpen(false);
    }
  };
  const runSelected = () => {
    if (runs.selected) launchRun(runs.selected);
    else setRunsOpen(true);
  };
  return { editRun, launchRun, runSelected };
}
