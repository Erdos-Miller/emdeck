import type { LimitWindow } from '../../../shared/contracts/workspace';
export function WindowUsage({
  window,
  resets,
  now,
}: {
  window: LimitWindow;
  resets: boolean;
  now: number;
}) {
  const expired = window.resetsAt != null && now / 1000 >= window.resetsAt;
  return (
    <div className='agent-limit'>
      <div>
        <span>{window.label}</span>
        <strong>
          {expired ? 'Refresh needed' : `${Math.max(0, 100 - window.usedPercent).toFixed(0)}% left`}
        </strong>
      </div>
      <progress
        aria-label={`${window.label} usage`}
        max={100}
        value={Math.min(100, window.usedPercent)}
      />
      {resets && (
        <small>
          {window.resetsAt == null
            ? 'Reset time not reported'
            : `${expired ? 'Reset was' : 'Resets'} ${new Date(window.resetsAt * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
        </small>
      )}
    </div>
  );
}
