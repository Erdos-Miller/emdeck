import type { AgentKind, AgentObservation } from '../../../shared/contracts/workspace';

const emptyPrompt = /^\s*[❯›>]\s*$/;
const directQuestion =
  /^(?:[●•]\s*)?(?:which|what|how|where|when|who|why|should|shall|would|could|can|do|does|is|are|will)\b[^\n]*\?\s*$/i;
const separator = /^[\s─━═╌┄┈╭╮╰╯│┌┐└┘├┤┬┴┼]+$/;

// Inspect only the current screen tail. A question mark in logs or older
// conversation is not sufficient evidence that the agent is awaiting input.
export const detectAgentActivity = (
  kind: AgentKind,
  lines: string[]
): AgentObservation['activity'] => {
  if (kind === 'shell' || kind === 'custom') return 'unknown';
  const tail = lines.slice(-16);
  const bottom = tail.join('\n');
  let prompt = -1;
  for (let index = tail.length - 1; index >= 0; index--) {
    if (/^\s*[❯›>]/.test(tail[index])) {
      prompt = index;
      break;
    }
  }
  const hasQuestion = tail.some(line => directQuestion.test(line.trim()));
  const choices = tail.filter(line => /^\s*[❯›>]?\s*\d+[.)]\s+\S/.test(line));
  const questionPicker =
    hasQuestion &&
    choices.length >= 2 &&
    (prompt < 0 || /^\s*[❯›>]\s*\d+[.)]/.test(tail[prompt])) &&
    /enter to (?:select|submit|confirm)|(?:↑|↓|arrow keys).*select|(?:^|\n)\s*[❯›>]\s*\d+[.)]/i.test(
      bottom
    );
  if (
    /esc(?:ape)? to interrupt|(?:thinking|working|generating|running|pondering|crafting|reasoning)…|(?:thinking|working|generating)\.\.\./i.test(
      bottom
    ) ||
    (!questionPicker && /esc(?:ape)? to cancel/i.test(bottom))
  )
    return 'working';
  if (
    /press enter to approve/i.test(bottom) ||
    (!questionPicker && /press enter to confirm/i.test(bottom)) ||
    (/do you want to (?:allow|proceed)|would you like to (?:run|approve)|allow (?:once|this|claude)|requires? (?:your )?approval|permission (?:required|request)/i.test(
      bottom
    ) &&
      /(?:^|\n)\s*[❯›>]?\s*(?:[1-9][.)]\s*)?(?:yes|no|allow once|allow always|deny|approve once)\b|\[y\/n\]/i.test(
        bottom
      ))
  )
    return 'attention';

  if (questionPicker) return 'question';

  if (prompt >= 0 && emptyPrompt.test(tail[prompt])) {
    const preceding = tail.slice(0, prompt).filter(line => line.trim() && !separator.test(line));
    const lastMessage = preceding.at(-1)?.trim() ?? '';
    const activePrompt = tail
      .slice(prompt + 1)
      .every(
        line =>
          !line.trim() ||
          separator.test(line) ||
          /\? for shortcuts|context|shift\+tab|ctrl\+|bypass permissions|auto mode|accept edits/i.test(
            line
          )
      );
    if (
      activePrompt &&
      (directQuestion.test(lastMessage) ||
        /^(?:[●•]\s*)?(?:waiting|awaiting) (?:for )?(?:your|an?) (?:answer|response|input)[.!…]*$/i.test(
          lastMessage
        ))
    )
      return 'question';
    return 'ready';
  }
  return /\? for shortcuts|send a message|type your message/i.test(bottom) ? 'ready' : 'unknown';
};
