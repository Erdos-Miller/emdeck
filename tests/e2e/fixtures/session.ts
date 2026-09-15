import type { Page } from '@playwright/test';

/** Drives the in-page session-server stand-in installed by session-server.mjs. */
interface SessionApi {
  actions: { method: string; params: Record<string, unknown> }[];
  ids: () => string[];
  panes: () => Record<string, unknown>[];
  emit: (id: string, text: string) => void;
  exit: (id: string, code?: number | null) => void;
  command: (id: string, command: Record<string, unknown>) => void;
  usage: (id: string, usage: unknown) => void;
  agent: (id: string, agent: Record<string, unknown>) => void;
}
type Window = { __emdeckSession: SessionApi };

export const paneIds = (page: Page) =>
  page.evaluate(() => (window as unknown as Window).__emdeckSession.ids());
export const panes = (page: Page) =>
  page.evaluate(() => (window as unknown as Window).__emdeckSession.panes());
export const emit = (page: Page, id: string, text: string) =>
  page.evaluate(input => (window as unknown as Window).__emdeckSession.emit(input.id, input.text), {
    id,
    text,
  });
export const exitPane = (page: Page, id: string, code: number | null = 0) =>
  page.evaluate(input => (window as unknown as Window).__emdeckSession.exit(input.id, input.code), {
    id,
    code,
  });
export const paneCommand = (page: Page, id: string, command: Record<string, unknown>) =>
  page.evaluate(
    input => (window as unknown as Window).__emdeckSession.command(input.id, input.command),
    { id, command }
  );
export const paneUsage = (page: Page, id: string, usage: unknown) =>
  page.evaluate(
    input => (window as unknown as Window).__emdeckSession.usage(input.id, input.usage),
    { id, usage }
  );
export const paneAgent = (page: Page, id: string, agent: Record<string, unknown>) =>
  page.evaluate(
    input => (window as unknown as Window).__emdeckSession.agent(input.id, input.agent),
    { id, agent }
  );
export const actions = (page: Page, method: string) =>
  page.evaluate(
    name =>
      (window as unknown as Window).__emdeckSession.actions
        .filter(action => action.method === name)
        .map(action => action.params),
    method
  );
export const actionCount = async (page: Page, method: string) =>
  (await actions(page, method)).length;
