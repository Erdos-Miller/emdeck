import type { AgentKind, AgentObservation } from '../../../shared/contracts/workspace';
import { agentCompletion, agentScreenTail, detectAgentActivity } from './agent-activity';

type Activity = AgentObservation['activity'];

// Per-process evidence, not a timer-based guess. Output silence cannot finish a
// task. A submit invalidates the old prompt even before the CLI repaints it.
export const createAgentActivityTracker = (kind: AgentKind) => {
  let activity: Activity = 'unknown';
  let draft = '';
  let busy = false;
  let submittedScreen: string | null = null;
  let completionBeforeTurn = '';
  let lastLines: string[] = [];
  const inspect = (lines: string[]): Activity => {
    lastLines = agentScreenTail(lines);
    const screen = lastLines.join('\n');
    if (submittedScreen === screen) return activity;
    const detected = detectAgentActivity(kind, lastLines);
    if (detected === 'working') {
      if (!busy) completionBeforeTurn = agentCompletion(lastLines);
      busy = true;
      submittedScreen = null;
    } else if (detected === 'question' || detected === 'attention') {
      busy = false;
      submittedScreen = null;
    } else if (busy) {
      const completion = agentCompletion(lastLines);
      const previousCompletions = new Set(completionBeforeTurn.split('\n'));
      const freshCompletion = completion
        .split('\n')
        .some(row => row && !previousCompletions.has(row));
      if (detected === 'ready' && freshCompletion) {
        busy = false;
        submittedScreen = null;
      } else {
        // A surviving input box is ambiguous during streaming. Do not advertise
        // readiness unless the turn has positively completed.
        activity = detected === 'ready' && submittedScreen === null ? 'unknown' : 'working';
        return activity;
      }
    }
    activity = detected;
    return activity;
  };
  const input = (data: string): Activity => {
    if (kind === 'shell' || kind === 'custom') return activity;
    if (data === '\r' || data === '\n') {
      if (draft || activity === 'attention' || activity === 'question') {
        completionBeforeTurn = agentCompletion(lastLines);
        submittedScreen = lastLines.join('\n');
        busy = true;
        activity = 'working';
      }
      draft = '';
    } else if (data === '\x03' || data === '\x1b') {
      draft = '';
      submittedScreen = null;
      busy = false;
      activity = 'unknown';
    } else if (data === '\x7f' || data === '\b') {
      draft = draft.slice(0, -1);
    } else if (data === '\x15') {
      draft = '';
    } else if (!data.startsWith('\x1b') || data.startsWith('\x1b[200~') || data === '\x1b[A') {
      if ([...data].some(char => char > ' ')) draft = (draft + data).slice(-4096);
    }
    return activity;
  };
  return { inspect, input };
};
