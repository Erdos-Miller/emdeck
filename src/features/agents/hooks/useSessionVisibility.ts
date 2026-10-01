import { useEffect, useState } from 'react';
import { readStored, store } from '../../../platform/storage/preferences';
import { restoreHiddenSessions } from '../services/session-visibility';

export const useSessionVisibility = (root: string | undefined) => {
  const scope = `relay:hidden-sessions:${encodeURIComponent(root ?? '')}`;
  const restore = () => ({ scope, keys: restoreHiddenSessions(readStored<unknown>(scope, [])) });
  const [saved, setSaved] = useState(restore);
  // Project replacement keeps the canvas mounted; switch preferences without
  // writing the previous project's keys into the new project's storage.
  if (saved.scope !== scope) setSaved(restore());
  useEffect(() => {
    if (saved.scope === scope) store(scope, saved.keys);
  }, [saved, scope]);
  const hide = (key: string) =>
    setSaved(previous => ({ ...previous, keys: restoreHiddenSessions([key, ...previous.keys]) }));
  const show = (keys: string[]) => {
    const revealed = new Set(keys);
    setSaved(previous =>
      previous.keys.some(key => revealed.has(key))
        ? { ...previous, keys: previous.keys.filter(key => !revealed.has(key)) }
        : previous
    );
  };
  return { hidden: new Set(saved.scope === scope ? saved.keys : []), hide, show };
};
