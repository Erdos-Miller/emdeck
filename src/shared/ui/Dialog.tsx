import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { DialogSpec } from '../contracts/dialog';
import { useLatest } from '../hooks/useLatest';
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const handleCloseMouseDown: React.ComponentProps<'div'>['onMouseDown'] = e => {
    if (e.target === e.currentTarget) onClose();
  };
  const ref = useRef<HTMLDivElement>(null);
  const close = useLatest(onClose);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>('input, select, textarea, button');
    first?.focus();
    const key = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== node) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
      if (e.key === 'Tab' && node) {
        const els = [
          ...node.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]'
          ),
        ];
        const start = els[0],
          end = els[els.length - 1];
        if (e.shiftKey && document.activeElement === start) {
          e.preventDefault();
          end?.focus();
        } else if (!e.shiftKey && document.activeElement === end) {
          e.preventDefault();
          start?.focus();
        }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      previous?.focus();
    };
  }, [close]);
  return (
    <div className='modal-backdrop' onMouseDown={handleCloseMouseDown}>
      <div
        ref={ref}
        className={`modal ${wide ? 'wide' : ''} ${className}`}
        role='dialog'
        aria-modal='true'
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button title='Close dialog' className='icon-button' onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export default function Dialog({ spec, onClose }: { spec: DialogSpec; onClose: () => void }) {
  const handleCloseClose = () => {
    spec.resolve(null);
    onClose();
  };
  const handleCloseSubmit: React.ComponentProps<'form'>['onSubmit'] = e => {
    e.preventDefault();
    spec.resolve(
      Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>
    );
    onClose();
  };
  const handleCloseClick = () => {
    spec.resolve(null);
    onClose();
  };
  return (
    <Modal title={spec.title} onClose={handleCloseClose}>
      <form onSubmit={handleCloseSubmit}>
        {spec.description && <p className='dialog-description'>{spec.description}</p>}
        {spec.fields?.map((field, i) => (
          <label className='field' key={field.name}>
            {field.label}
            {field.options ? (
              <select
                aria-label={field.label}
                name={field.name}
                defaultValue={field.value}
                required={!field.optional}
              >
                {field.options.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                autoFocus={i === 0}
                name={field.name}
                defaultValue={field.value}
                placeholder={field.placeholder}
                required={!field.optional}
                type={field.type ?? 'text'}
                autoComplete='off'
              />
            )}
          </label>
        ))}
        <footer className='dialog-footer'>
          <button type='button' className='button secondary' onClick={handleCloseClick}>
            Cancel
          </button>
          <button className={`button ${spec.danger ? 'danger' : 'primary'}`} type='submit'>
            {spec.submit ?? 'Save'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
