import { EyeOff } from 'lucide-react';

export default function HideSessionButton({ name, onHide }: { name: string; onHide: () => void }) {
  return (
    <button
      className='icon-button'
      aria-label={`Hide ${name}`}
      title='Hide session; keep it running'
      onClick={onHide}
    >
      <EyeOff size={13} />
    </button>
  );
}
