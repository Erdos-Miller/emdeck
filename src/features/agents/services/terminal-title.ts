import type { SessionPane } from '../../../shared/contracts/sessions';
import type { Pane } from '../../../shared/contracts/workspace';

export const terminalTitle = (value: string) =>
  Array.from(value)
    .filter(character => !/[\p{Cc}\p{Cf}]/u.test(character))
    .slice(0, 200)
    .join('')
    .trim();

export const paneName = (pane: Pick<Pane, 'name' | 'title' | 'customName'>) =>
  pane.customName || pane.title || pane.name;

export const sessionName = (pane: Pick<SessionPane, 'launch' | 'title'>) =>
  terminalTitle(pane.title ?? '') || pane.launch.name;
