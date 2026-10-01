import { defaultNotifications } from '../services/notification-settings';
export const defaults: Settings = {
  theme: 'dark',
  accent: '#b8ee86',
  fontSize: 13,
  terminalFontSize: 12,
  terminalFontFamily: '',
  terminalLineHeight: 1.35,
  wordWrap: false,
  showHidden: true,
  shell: '',
  scrollback: 3000,
  detectRunScripts: true,
  reopenLastProject: true,
  notifications: defaultNotifications,
  terminalPlacement: 'workspace',
};
import type { Settings } from '../../../shared/contracts/workspace';
