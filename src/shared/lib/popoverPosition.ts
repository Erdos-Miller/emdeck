type Viewport = { left: number; top: number; width: number; height: number };
type Anchor = { top: number; bottom: number; right: number };
type Size = { width: number; height: number };

export const positionPopover = (anchor: Anchor, size: Size, viewport: Viewport) => {
  const margin = 8;
  const gap = 6;
  const leftEdge = viewport.left + margin;
  const rightEdge = viewport.left + viewport.width - margin;
  const topEdge = viewport.top + margin;
  const bottomEdge = viewport.top + viewport.height - margin;
  const above = Math.max(0, Math.min(anchor.top, bottomEdge) - topEdge - gap);
  const below = Math.max(0, bottomEdge - Math.max(anchor.bottom, topEdge) - gap);
  const side = size.height <= below || (size.height > above && below >= above) ? 'below' : 'above';
  const maxHeight = side === 'below' ? below : above;
  const height = Math.min(size.height, maxHeight);
  const width = Math.min(size.width, Math.max(0, rightEdge - leftEdge));
  const desiredTop = side === 'below' ? anchor.bottom + gap : anchor.top - gap - height;
  return {
    side,
    width,
    maxHeight,
    left: Math.max(leftEdge, Math.min(anchor.right - width, rightEdge - width)),
    top: Math.max(topEdge, Math.min(desiredTop, bottomEdge - height)),
  };
};
