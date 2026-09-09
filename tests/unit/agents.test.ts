import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agentKind,
  agentStatus,
  inspectAgentScreen,
  loadAgentPreferences,
  metricNumber,
} from '../../src/features/agents/lib/agents';

afterEach(() => vi.unstubAllGlobals());
describe('agent overview', () => {
  it('recognizes CLI executables without treating arbitrary commands as agents', () => {
    expect(agentKind('"C:\\Program Files\\Claude\\claude.exe" --resume')).toBe('claude');
    expect(agentKind('/usr/local/bin/codex --model gpt-5')).toBe('codex');
    expect(agentKind('gemini')).toBe('gemini');
    expect(agentKind('echo claude')).toBe('custom');
    expect(agentKind('  ')).toBe('shell');
  });
  it('detects an approval prompt with choices, not a mention in old output', () => {
    const prompt = ['Would you like to run the following command?', '❯ 1. Yes', '  2. No'];
    expect(inspectAgentScreen('codex', prompt).activity).toBe('attention');
    expect(inspectAgentScreen('codex', ['The app requires your approval', '›']).activity).toBe(
      'ready'
    );
    expect(inspectAgentScreen('codex', [...prompt, ...Array(28).fill(''), '›']).activity).toBe(
      'ready'
    );
    expect(inspectAgentScreen('codex', [...prompt, 'Esc to interrupt']).activity).toBe('working');
    expect(inspectAgentScreen('shell', prompt).activity).toBe('unknown');
  });
  it('keeps observed context separate from missing numbers and supports zero', () => {
    expect(inspectAgentScreen('codex', ['gpt-5.5 · 100% context left']).contextPercent).toBe(0);
    expect(inspectAgentScreen('claude', ['Opus 4.6 · 25% context']).contextPercent).toBe(25);
    expect(inspectAgentScreen('codex', ['101% context left']).contextPercent).toBeNull();
    expect(inspectAgentScreen('codex', ['hello']).contextPercent).toBeNull();
    expect(metricNumber(0)).toBe('0');
    expect(metricNumber(null)).toBe('Not reported');
  });
  it('gives terminal exit and failure priority over stale observations', () => {
    const observation = inspectAgentScreen('claude', ['Press Enter to approve']);
    expect(agentStatus('exited', observation).label).toBe('Exited');
    expect(agentStatus('error', observation).label).toBe('Error');
    expect(agentStatus('running', observation).tone).toBe('attention');
  });
  it('restores custom details and rejects invalid saved preferences', () => {
    vi.stubGlobal('localStorage', {
      getItem: () =>
        JSON.stringify({
          metrics: ['cost', 'model', 'cost', 'bad'],
          compact: true,
          visible: 'false',
          refreshSeconds: 1,
        }),
    });
    expect(loadAgentPreferences()).toMatchObject({
      metrics: ['cost', 'model'],
      compact: true,
      visible: true,
      refreshSeconds: 0,
    });
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ metrics: [] }) });
    expect(loadAgentPreferences().metrics).toEqual([]);
  });
});
