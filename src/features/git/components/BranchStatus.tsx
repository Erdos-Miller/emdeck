import { ArrowDown, ArrowUp } from 'lucide-react';
import type { BranchDetail } from '../../../shared/contracts/workspace';
import { shortRef } from '../services/references';
export function BranchStatus({ branch }: { branch?: BranchDetail }) {
  if (!branch) return null;
  return (
    <span className='branch-status'>
      {branch.gone && (
        <span
          className='branch-gone'
          title='Tracked branch is missing. Fetch or choose another tracked branch.'
        >
          gone
        </span>
      )}
      {!!branch.behind && (
        <span
          className='branch-incoming'
          title={`${branch.behind} incoming commits from ${shortRef(branch.upstream ?? '')}`}
          aria-label={`${branch.behind} incoming commits`}
        >
          <ArrowDown size={12} />
          {branch.behind}
        </span>
      )}
      {!!branch.ahead && (
        <span
          className='branch-outgoing'
          title={`${branch.ahead} outgoing commits to ${shortRef(branch.upstream ?? '')}`}
          aria-label={`${branch.ahead} outgoing commits`}
        >
          <ArrowUp size={12} />
          {branch.ahead}
        </span>
      )}
    </span>
  );
}
