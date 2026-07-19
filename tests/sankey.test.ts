// Positional layout tests for the Sankey.
//
// Area- or total-only assertions pass on visually broken layouts: a diagram that
// stacks every node at y=0 conserves total value perfectly and renders as a
// single black smear. Positions, bounds, ordering and pairwise overlap are what
// actually catch it.
import { describe, expect, it } from 'vitest';
import { ribbonPath, sankeyLayout, type SankeyInput, type SankeyNode } from '../src/utils/sankey';

const EPS = 1e-6;

function overlapLength(a: SankeyNode, b: SankeyNode): number {
  return Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
}

const basic: SankeyInput = {
  sources: [
    { id: 's1', label: 'Ores' },
    { id: 's2', label: 'Fuels' },
    { id: 's3', label: 'Food' },
  ],
  targets: [
    { id: 't1', label: 'China' },
    { id: 't2', label: 'Japan' },
    { id: 't3', label: 'Korea' },
  ],
  links: [
    { source: 's1', target: 't1', value: 100 },
    { source: 's1', target: 't2', value: 40 },
    { source: 's2', target: 't2', value: 60 },
    { source: 's2', target: 't3', value: 30 },
    { source: 's3', target: 't1', value: 20 },
  ],
};

const OPTS = { width: 600, height: 400, nodeWidth: 12, padding: 6 };

describe('sankeyLayout — geometry', () => {
  it('places every node inside the canvas', () => {
    const { nodes } = sankeyLayout(basic, OPTS);
    expect(nodes.length).toBeGreaterThan(0);
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(-EPS);
      expect(n.y).toBeGreaterThanOrEqual(-EPS);
      expect(n.x + n.w).toBeLessThanOrEqual(OPTS.width + EPS);
      expect(n.y + n.h).toBeLessThanOrEqual(OPTS.height + EPS);
    }
  });

  it('produces no NaN or undefined coordinates', () => {
    const { nodes, links } = sankeyLayout(basic, OPTS);
    for (const n of nodes) {
      for (const v of [n.x, n.y, n.w, n.h, n.value]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
    for (const l of links) {
      for (const v of [l.x0, l.x1, l.y0, l.y1, l.width]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('never overlaps two nodes on the same side', () => {
    const { nodes } = sankeyLayout(basic, OPTS);
    for (const side of ['source', 'target'] as const) {
      const col = nodes.filter((n) => n.side === side);
      for (let i = 0; i < col.length; i++) {
        for (let j = i + 1; j < col.length; j++) {
          expect(overlapLength(col[i], col[j])).toBeLessThan(0.5);
        }
      }
    }
  });

  it('puts sources on the left and targets on the right, not on top of each other', () => {
    const { nodes } = sankeyLayout(basic, OPTS);
    const sources = nodes.filter((n) => n.side === 'source');
    const targets = nodes.filter((n) => n.side === 'target');
    const rightmostSource = Math.max(...sources.map((n) => n.x + n.w));
    const leftmostTarget = Math.min(...targets.map((n) => n.x));
    expect(rightmostSource).toBeLessThanOrEqual(leftmostTarget + EPS);
  });

  it('stacks each column in the given order without gaps beyond the padding', () => {
    const { nodes } = sankeyLayout(basic, OPTS);
    const sources = nodes.filter((n) => n.side === 'source');
    for (let i = 1; i < sources.length; i++) {
      const gap = sources[i].y - (sources[i - 1].y + sources[i - 1].h);
      expect(gap).toBeCloseTo(OPTS.padding, 4);
    }
  });

  it('fills the canvas height: node heights plus gaps equal the height', () => {
    const { nodes } = sankeyLayout(basic, OPTS);
    for (const side of ['source', 'target'] as const) {
      const col = nodes.filter((n) => n.side === side);
      const used = col.reduce((a, n) => a + n.h, 0) + (col.length - 1) * OPTS.padding;
      expect(used).toBeCloseTo(OPTS.height, 3);
    }
  });

  it('sizes nodes proportionally to their total value', () => {
    const { nodes } = sankeyLayout(basic, OPTS);
    const s1 = nodes.find((n) => n.id === 's1' && n.side === 'source')!;
    const s3 = nodes.find((n) => n.id === 's3' && n.side === 'source')!;
    // s1 carries 140, s3 carries 20 — seven times the height.
    expect(s1.value).toBe(140);
    expect(s3.value).toBe(20);
    expect(s1.h / s3.h).toBeCloseTo(7, 1);
  });
});

describe('sankeyLayout — ribbons', () => {
  it('anchors every ribbon to the edge of its two nodes', () => {
    const { nodes, links } = sankeyLayout(basic, OPTS);
    const source = nodes.find((n) => n.side === 'source')!;
    const target = nodes.find((n) => n.side === 'target')!;
    for (const l of links) {
      expect(l.x0).toBeCloseTo(source.x + source.w, 6);
      expect(l.x1).toBeCloseTo(target.x, 6);
    }
  });

  it('keeps every ribbon band inside its node', () => {
    const { nodes, links } = sankeyLayout(basic, OPTS);
    for (const l of links) {
      const s = nodes.find((n) => n.side === 'source' && n.id === l.source)!;
      const t = nodes.find((n) => n.side === 'target' && n.id === l.target)!;
      expect(l.y0).toBeGreaterThanOrEqual(s.y - EPS);
      expect(l.y0).toBeLessThanOrEqual(s.y + s.h + EPS);
      expect(l.y1).toBeGreaterThanOrEqual(t.y - EPS);
      expect(l.y1).toBeLessThanOrEqual(t.y + t.h + EPS);
    }
  });

  it('conserves value: ribbon widths on a node sum to the node height', () => {
    const { nodes, links } = sankeyLayout(basic, OPTS);
    const s1 = nodes.find((n) => n.id === 's1' && n.side === 'source')!;
    const widths = links.filter((l) => l.source === 's1').reduce((a, l) => a + l.width, 0);
    expect(widths).toBeCloseTo(s1.h, 3);
  });

  it('drops links referring to a node that does not exist', () => {
    const { links } = sankeyLayout(
      { ...basic, links: [...basic.links, { source: 'ghost', target: 't1', value: 999 }] },
      OPTS,
    );
    expect(links.every((l) => l.source !== 'ghost')).toBe(true);
  });

  it('ignores zero, negative and non-finite values', () => {
    const { links } = sankeyLayout(
      {
        ...basic,
        links: [
          { source: 's1', target: 't1', value: 0 },
          { source: 's1', target: 't2', value: -5 },
          { source: 's2', target: 't3', value: Number.NaN },
          { source: 's3', target: 't1', value: 10 },
        ],
      },
      OPTS,
    );
    expect(links).toHaveLength(1);
    expect(links[0].value).toBe(10);
  });

  it('emits a valid cubic path with no NaN', () => {
    const { links } = sankeyLayout(basic, OPTS);
    const d = ribbonPath(links[0]);
    expect(d).toMatch(/^M[\d.-]+,[\d.-]+ C/);
    expect(d).not.toContain('NaN');
  });
});

describe('sankeyLayout — degenerate inputs', () => {
  it('returns empty geometry for no links', () => {
    const out = sankeyLayout({ sources: [{ id: 'a', label: 'a' }], targets: [{ id: 'b', label: 'b' }], links: [] }, OPTS);
    expect(out.links).toHaveLength(0);
    expect(out.nodes).toHaveLength(0);
  });

  it('drops nodes that carry no value', () => {
    const out = sankeyLayout(
      {
        sources: [{ id: 's1', label: 'a' }, { id: 'empty', label: 'b' }],
        targets: [{ id: 't1', label: 'c' }],
        links: [{ source: 's1', target: 't1', value: 10 }],
      },
      OPTS,
    );
    expect(out.nodes.find((n) => n.id === 'empty')).toBeUndefined();
  });

  it('survives a zero-size canvas without producing NaN', () => {
    const out = sankeyLayout(basic, { width: 0, height: 0 });
    for (const n of out.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.h)).toBe(true);
      expect(n.h).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles a single link', () => {
    const out = sankeyLayout(
      {
        sources: [{ id: 's', label: 's' }],
        targets: [{ id: 't', label: 't' }],
        links: [{ source: 's', target: 't', value: 5 }],
      },
      OPTS,
    );
    expect(out.nodes).toHaveLength(2);
    expect(out.nodes[0].h).toBeCloseTo(OPTS.height, 3);
    expect(out.links[0].width).toBeCloseTo(OPTS.height, 3);
  });
});
