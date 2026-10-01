import type { Layout, Settings } from './workspace';

export const PROJECT_CONFIG_VERSION = 1;
export const PROJECT_CONFIG_DIR = '.emdeck';
export const PROJECT_CONFIG_FILE = 'settings.json';

/** Startup and sound preferences belong to the user, never to a project file. */
export type SettingsOverrides = Partial<Omit<Settings, 'reopenLastProject' | 'notifications'>>;

export type WorkspaceOverrides = Partial<{
  layout: Layout;
  sidebarWidth: number;
  terminalHeight: number;
}>;

/** Run preferences stay `unknown` here: contracts cannot import feature types. */
export interface ProjectConfig {
  version: number;
  settings: SettingsOverrides;
  workspace: WorkspaceOverrides;
  runs?: unknown;
}

export const emptyProjectConfig: ProjectConfig = {
  version: PROJECT_CONFIG_VERSION,
  settings: {},
  workspace: {},
};
