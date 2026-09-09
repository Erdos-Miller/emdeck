import { ExternalLink, Monitor, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { RemoteProfile } from '../../../shared/contracts/remote';
import type { Pane } from '../../../shared/contracts/workspace';
import { Modal } from '../../../shared/ui/Dialog';
import ConnectionForm from './ConnectionForm';

interface Props {
  profiles: RemoteProfile[];
  panes: Pane[];
  hasProject: boolean;
  onSave: (profile: RemoteProfile) => void;
  onRemove: (id: string) => void;
  onConnect: (profile: RemoteProfile) => void;
  onClose: () => void;
}
export default function RemoteConnections({
  profiles,
  panes,
  hasProject,
  onSave,
  onRemove,
  onConnect,
  onClose,
}: Props) {
  const [editing, setEditing] = useState<RemoteProfile | null | undefined>(undefined);
  const handleNew = () => setEditing(null);
  const handleCancel = () => setEditing(undefined);
  const handleSave = (profile: RemoteProfile) => {
    onSave(profile);
    setEditing(undefined);
  };
  return (
    <Modal title='Remote connections' onClose={onClose}>
      {editing !== undefined ? (
        <ConnectionForm
          key={editing?.id ?? 'new'}
          profile={editing}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      ) : (
        <>
          <p className='dialog-description'>
            Save connections to machines and provider sessions. Nothing connects automatically when
            Emdeck starts.
          </p>
          {!hasProject && (
            <p className='connection-help'>Open a project before attaching an SSH terminal.</p>
          )}
          <div className='connection-list'>
            {profiles.map(profile => {
              const attached = panes.some(pane => pane.remote?.id === profile.id);
              const handleConnect = () => onConnect(profile);
              const handleEdit = () => setEditing(profile);
              const handleRemove = () => onRemove(profile.id);
              return (
                <article className='connection-row' key={profile.id}>
                  {profile.kind === 'ssh' ? <Monitor size={18} /> : <ExternalLink size={18} />}
                  <div>
                    <strong>{profile.name}</strong>
                    <small>
                      {profile.kind === 'ssh'
                        ? `${profile.target.host} · ${profile.target.backend}${profile.target.session ? ` / ${profile.target.session}` : ''}`
                        : 'Browser session · status not available'}
                    </small>
                  </div>
                  <button
                    className='button secondary'
                    disabled={profile.kind === 'ssh' && !hasProject}
                    onClick={handleConnect}
                  >
                    {profile.kind === 'web'
                      ? 'Open in browser'
                      : attached
                        ? 'Show terminal'
                        : 'Connect'}
                  </button>
                  <button
                    className='icon-button'
                    title={`Edit ${profile.name}`}
                    disabled={attached}
                    onClick={handleEdit}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className='icon-button'
                    title={`Remove ${profile.name}`}
                    disabled={attached}
                    onClick={handleRemove}
                  >
                    <Trash2 size={14} />
                  </button>
                </article>
              );
            })}
            {!profiles.length && (
              <div className='connection-empty'>
                <Monitor size={28} />
                <h3>Your machines, together.</h3>
                <p>
                  Attach existing Claude, Codex and other agents through their multiplexer, or save
                  a provider’s remote session link.
                </p>
              </div>
            )}
          </div>
          <footer className='dialog-footer'>
            <button className='button secondary' onClick={onClose}>
              Done
            </button>
            <button className='button primary' onClick={handleNew} disabled={profiles.length >= 50}>
              <Plus size={14} />
              Add connection
            </button>
          </footer>
        </>
      )}
    </Modal>
  );
}
