import { readStored, store } from '../../../platform/storage/preferences';
import type { Project } from '../../../shared/contracts/workspace';
export function rememberProject(project: Project | null) {
  if (project) store('relay:last-project', project);
}
export function lastProjectPath(): string | null {
  const saved = readStored<Partial<Project> | null>('relay:last-project', null);
  if (typeof saved?.root === 'string' && saved.root.trim()) return saved.root;
  // Earlier releases only saved recent projects. Reuse that list on first upgrade.
  const recent = readStored<unknown>('relay:recent', []);
  if (!Array.isArray(recent)) return null;
  const project = recent.find(item => typeof item?.root === 'string' && item.root.trim());
  return project?.root ?? null;
}
