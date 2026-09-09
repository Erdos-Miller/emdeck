import { ArrowRight } from 'lucide-react';
import { native } from '../../platform/desktop/api';
import type { WorkspaceController } from '../hooks/useWorkspace';
type Props = {
  model: Pick<WorkspaceController, 'setHelpOpen'>;
};
export default function PreviewBanner({ model }: Props) {
  const handleHelpOpenClick = () => setHelpOpen(true);
  const { setHelpOpen } = model;
  return (
    !native && (
      <div className='preview-banner'>
        <span className='preview-label'>INTERACTIVE PREVIEW</span>
        <span>
          Explore the workspace. Use Emdeck desktop for local files, Git, and real agent sessions.
        </span>
        <button onClick={handleHelpOpenClick}>
          How to launch <ArrowRight size={12} />
        </button>
      </div>
    )
  );
}
