import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Components } from 'react-markdown';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { call, native } from '../../../platform/desktop/api';
import { useLatest } from '../../../shared/hooks/useLatest';
import { markdownHeadings, markdownTarget } from '../services/markdown';
function MarkdownImage({
  root,
  path,
  src = '',
  alt = '',
  title,
}: {
  root: string;
  path: string;
  src?: string;
  alt?: string;
  title?: string;
}) {
  const handleLoadRemoteImage = () => {
    if (target.kind === 'external') setSource(target.url);
  };
  const handleErrorError = () => setError('Could not load this image.');
  const target = useMemo(() => markdownTarget(path, src), [path, src]);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setSource('');
    setError('');
    if (target.kind === 'file')
      void call('read_image', { root, path: target.path })
        .then(value => {
          if (!cancelled) setSource(value);
        })
        .catch(reason => {
          if (!cancelled) setError(String(reason));
        });
    return () => {
      cancelled = true;
    };
  }, [root, target]);
  if (error || target.kind === 'invalid')
    return (
      <span className='markdown-image-placeholder' title={error || 'Unsupported image location'}>
        Image unavailable{alt ? `: ${alt}` : ''}
      </span>
    );
  if (target.kind === 'external' && !source)
    return (
      <button
        className='markdown-image-placeholder'
        onClick={handleLoadRemoteImage}
        title={target.url}
      >
        Load image{alt ? `: ${alt}` : ''}
      </button>
    );
  if (!source)
    return (
      <span className='markdown-image-placeholder'>Loading image{alt ? `: ${alt}` : ''}…</span>
    );
  return (
    <img
      src={source}
      alt={alt}
      title={title}
      loading='lazy'
      referrerPolicy='no-referrer'
      onError={handleErrorError}
    />
  );
}
interface Props {
  root: string;
  path: string;
  content: string;
  onNavigate: (path: string, fragment: string) => void;
  anchor: {
    fragment: string;
    request: number;
  } | null;
}
const remarkPlugins = [remarkGfm];
const rehypePlugins = [markdownHeadings];
const MarkdownContent = memo(function MarkdownContent({
  content,
  components,
}: {
  content: string;
  components: Components;
}) {
  return (
    <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
      {content}
    </Markdown>
  );
});
export default function MarkdownPreview({ root, path, content, onNavigate, anchor }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const navigate = useLatest(onNavigate);

  const [error, setError] = useState('');
  const deferredContent = useDeferredValue(content);
  const scrollTo = (fragment: string) => {
    const container = host.current;
    if (!container) return;
    if (!fragment) {
      container.scrollTop = 0;
      return;
    }
    const element = [...container.querySelectorAll<HTMLElement>('[id]')].find(
      el => el.id === `md-${fragment}` || el.id === fragment
    );
    if (element)
      container.scrollTop +=
        element.getBoundingClientRect().top - container.getBoundingClientRect().top - 24;
  };
  useEffect(() => {
    if (anchor) scrollTo(anchor.fragment);
  }, [anchor]);
  const components = useMemo<Components>(
    () => ({
      a: ({ href = '', children, title }) => {
        const handleAuxClick: React.ComponentProps<'a'>['onAuxClick'] = event =>
          event.preventDefault();
        const handleErrorClick: React.ComponentProps<'a'>['onClick'] = event => {
          event.preventDefault();
          if (target.kind === 'invalid') return;
          setError('');
          if (target.kind === 'file') {
            if (target.path === path) scrollTo(target.fragment);
            else navigate.current(target.path, target.fragment);
          } else if (native) {
            void call('open_external_url', { url: target.url }).catch(reason =>
              setError(String(reason))
            );
          } else window.open(target.url, '_blank', 'noopener,noreferrer');
        };
        const target = markdownTarget(path, href);
        if (target.kind === 'invalid') return <span title={title}>{children}</span>;
        return (
          <a href={href} title={title} onAuxClick={handleAuxClick} onClick={handleErrorClick}>
            {children}
          </a>
        );
      },
      img: ({ src, alt, title }) => (
        <MarkdownImage root={root} path={path} src={src} alt={alt} title={title} />
      ),
      table: ({ children }) => (
        <div className='markdown-table'>
          <table>{children}</table>
        </div>
      ),
    }),
    [path, navigate, root]
  );
  return (
    <section className='markdown-preview' aria-label='Markdown preview' ref={host} tabIndex={0}>
      {error && (
        <p className='markdown-error' role='alert'>
          {error}
        </p>
      )}
      <article className='markdown-body'>
        {deferredContent.length > 1000000 ? (
          <p>This document is too large to preview. Use Edit to read and change its source.</p>
        ) : deferredContent.trim() ? (
          <MarkdownContent content={deferredContent} components={components} />
        ) : (
          <p className='markdown-empty'>
            This Markdown file is empty. Choose Edit or Split to start writing.
          </p>
        )}
      </article>
    </section>
  );
}
