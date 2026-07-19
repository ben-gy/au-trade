// Label de-collision is a layout algorithm, so it gets positional tests too:
// the point is that no two placed labels overlap, which a "did it render"
// assertion would never catch.
import { describe, expect, it } from 'vitest';
import { placeLabels } from '../src/views/exposure';

interface Box { x: number; y: number; w: number; h: number }

function boxesFrom(svg: string): Box[] {
  const CHAR_W = 5.15;
  const LINE_H = 11;
  const out: Box[] = [];
  const re = /<text class="dot-label" x="([\d.-]+)"\s+y="([\d.-]+)"\s+text-anchor="(start|end)"[^>]*>([^<]*)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    const w = m[4].trim().length * CHAR_W;
    out.push({ x: m[3] === 'end' ? x - w : x, y: y - LINE_H + 2, w, h: LINE_H });
  }
  return out;
}

function overlapArea(a: Box, b: Box): number {
  const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ox * oy;
}

describe('placeLabels', () => {
  it('places a lone label', () => {
    const svg = placeLabels([{ text: 'Iron ore', cx: 500, cy: 300, r: 10 }]);
    expect(svg).toContain('Iron ore');
    expect(boxesFrom(svg)).toHaveLength(1);
  });

  it('never overlaps two placed labels', () => {
    // Four dots stacked almost on top of each other — the real failure case
    // (coal, gold, meat and cereals all cluster at $10-100bn / ~30%).
    const items = [
      { text: 'Metalliferous ores', cx: 600, cy: 300, r: 20 },
      { text: 'Coal, coke and briquettes', cx: 605, cy: 302, r: 18 },
      { text: 'Gold, non-monetary', cx: 610, cy: 298, r: 18 },
      { text: 'Meat and meat preparations', cx: 602, cy: 305, r: 15 },
    ];
    const boxes = boxesFrom(placeLabels(items));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlapArea(boxes[i], boxes[j])).toBeLessThan(0.5);
      }
    }
  });

  it('keeps every label inside the canvas', () => {
    const items = [
      { text: 'Far right commodity', cx: 995, cy: 100, r: 8 },
      { text: 'Far left commodity', cx: 5, cy: 200, r: 8 },
    ];
    for (const b of boxesFrom(placeLabels(items))) {
      expect(b.x).toBeGreaterThanOrEqual(20);
      expect(b.x + b.w).toBeLessThanOrEqual(1000);
    }
  });

  it('drops a label rather than overlapping when nothing fits', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      text: `Commodity number ${i}`,
      cx: 500,
      cy: 300,
      r: 2,
    }));
    const boxes = boxesFrom(placeLabels(items));
    expect(boxes.length).toBeLessThan(items.length);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlapArea(boxes[i], boxes[j])).toBeLessThan(0.5);
      }
    }
  });

  it('produces no NaN coordinates', () => {
    const svg = placeLabels([{ text: 'A', cx: 10, cy: 20, r: 3 }]);
    expect(svg).not.toContain('NaN');
  });

  it('escapes markup in label text', () => {
    const svg = placeLabels([{ text: '<script>x</script>', cx: 500, cy: 300, r: 5 }]);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('returns an empty string for no items', () => {
    expect(placeLabels([])).toBe('');
  });
});
