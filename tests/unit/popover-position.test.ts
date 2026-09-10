import { describe, expect, it } from 'vitest';
import { positionPopover } from '../../src/shared/lib/popoverPosition';

const size = { width: 250, height: 300 };
const viewport = { left: 0, top: 0, width: 960, height: 640 };

describe('popover placement', () => {
  it('prefers below when there is room and aligns to the trigger end', () => {
    expect(positionPopover({ top: 100, bottom: 128, right: 950 }, size, viewport)).toEqual({
      side: 'below',
      left: 700,
      top: 134,
      width: 250,
      maxHeight: 498,
    });
  });

  it('opens above a low trigger without touching the viewport edges', () => {
    expect(positionPopover({ top: 600, bottom: 628, right: 950 }, size, viewport)).toEqual({
      side: 'above',
      left: 700,
      top: 294,
      width: 250,
      maxHeight: 586,
    });
  });

  it('uses the larger side and caps height when neither side fits', () => {
    const small = { ...viewport, width: 400, height: 240 };
    expect(positionPopover({ top: 110, bottom: 138, right: 395 }, size, small)).toEqual({
      side: 'above',
      left: 142,
      top: 8,
      width: 250,
      maxHeight: 96,
    });
    expect(positionPopover({ top: 30, bottom: 58, right: 395 }, size, small)).toEqual({
      side: 'below',
      left: 142,
      top: 64,
      width: 250,
      maxHeight: 168,
    });
  });

  it('clamps to both horizontal edges and shrinks to a narrow viewport', () => {
    expect(positionPopover({ top: 100, bottom: 128, right: 30 }, size, viewport).left).toBe(8);
    const small = { ...viewport, width: 180, height: 260 };
    expect(positionPopover({ top: 30, bottom: 58, right: 178 }, size, small)).toEqual({
      side: 'below',
      left: 8,
      top: 64,
      width: 164,
      maxHeight: 188,
    });
  });

  it('accounts for a visual viewport offset when zooming', () => {
    const zoomed = { left: 200, top: 100, width: 300, height: 400 };
    const result = positionPopover({ top: 140, bottom: 168, right: 475 }, size, zoomed);
    expect(result).toEqual({ side: 'below', left: 225, top: 174, width: 250, maxHeight: 318 });
  });

  it('switches direction when the available height changes', () => {
    const anchor = { top: 280, bottom: 308, right: 950 };
    expect(positionPopover(anchor, size, viewport).side).toBe('below');
    expect(positionPopover(anchor, size, { ...viewport, height: 450 })).toMatchObject({
      side: 'above',
      top: 8,
      maxHeight: 266,
    });
  });
});
