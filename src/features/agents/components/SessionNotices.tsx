import type { SessionDeskController } from '../hooks/useSessionDesk';
import { sessionName } from '../services/terminal-title';
import { createPortal } from 'react-dom';
import { Modal } from '../../../shared/ui/Dialog';

export default function SessionNotices({ model }: { model: SessionDeskController }) {
  const { operation, pending } = model;
  const stopping = operation?.kind === 'stop';
  const handleConfirm = () => void model.confirmOperation();
  return (
    <>
      {model.error && (
        <p className='session-error' role='alert'>
          {model.error}
        </p>
      )}
      {operation &&
        createPortal(
          <Modal
            title={stopping ? 'Stop background session?' : 'Remove background session?'}
            onClose={model.dismissOperation}
          >
            <p className='dialog-description'>
              {stopping ? 'Stop' : 'Remove'} <strong>{sessionName(operation.pane)}</strong> on{' '}
              <strong>{operation.machine.profile.name}</strong>?
              {stopping
                ? ' Its running process will end. The stopped session will remain available until you remove it.'
                : ' This removes the stopped session from the machine and closes its view. Project files are kept.'}
            </p>
            {model.operationError && (
              <p className='session-error' role='alert'>
                {model.operationError}
              </p>
            )}
            <footer className='dialog-footer'>
              <button
                className='button secondary'
                disabled={pending}
                onClick={model.dismissOperation}
              >
                {stopping ? 'Keep running' : 'Keep session'}
              </button>
              <button className='button danger' disabled={pending} onClick={handleConfirm}>
                {pending
                  ? stopping
                    ? 'Stopping…'
                    : 'Removing…'
                  : stopping
                    ? 'Stop process'
                    : 'Remove session'}
              </button>
            </footer>
          </Modal>,
          document.body
        )}
    </>
  );
}
