// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * Minimal two-column Sankey layout. Pure geometry, no DOM — so the positional
 * tests can assert bounds, ordering and non-overlap directly.
 *
 * Deliberately not a general graph Sankey: this diagram is always
 * "commodity section → trading partner", a bipartite two-column flow, and a
 * general implementation would be more code with more ways to be wrong.
 */

export interface SankeyInput {
  /** left-hand nodes, in the order they should stack */
  sources: Array<{ id: string; label: string }>;
  /** right-hand nodes, in the order they should stack */
  targets: Array<{ id: string; label: string }>;
  links: Array<{ source: string; target: string; value: number }>;
}

export interface SankeyNode {
  id: string;
  label: string;
  side: 'source' | 'target';
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  /** vertical band on the source node */
  y0: number;
  /** vertical band on the target node */
  y1: number;
  /** thickness, equal at both ends */
  width: number;
  x0: number;
  x1: number;
}

export interface SankeyLayout {
  nodes: SankeyNode[];
  links: SankeyLink[];
  width: number;
  height: number;
}

export interface SankeyOptions {
  width: number;
  height: number;
  nodeWidth?: number;
  /** vertical gap between stacked nodes, in px */
  padding?: number;
}

/**
 * Lay out a bipartite flow. Node heights are proportional to their total value;
 * the gaps between them consume a fixed share of the height, so a column with
 * many nodes gets thinner bars rather than overflowing the canvas.
 */
export function sankeyLayout(input: SankeyInput, opts: SankeyOptions): SankeyLayout {
  const width = Math.max(0, opts.width);
  const height = Math.max(0, opts.height);
  const nodeWidth = opts.nodeWidth ?? 14;
  const padding = opts.padding ?? 6;

  const totals = new Map<string, number>();
  for (const l of input.links) {
    if (!Number.isFinite(l.value) || l.value <= 0) continue;
    totals.set(l.source, (totals.get(l.source) ?? 0) + l.value);
    totals.set(l.target, (totals.get(l.target) ?? 0) + l.value);
  }

  const sources = input.sources.filter((n) => (totals.get(n.id) ?? 0) > 0);
  const targets = input.targets.filter((n) => (totals.get(n.id) ?? 0) > 0);

  const sumSide = (side: Array<{ id: string }>) =>
    side.reduce((a, n) => a + (totals.get(n.id) ?? 0), 0);

  const layoutSide = (
    side: Array<{ id: string; label: string }>,
    x: number,
    sideName: 'source' | 'target',
  ): SankeyNode[] => {
    const total = sumSide(side);
    const gaps = Math.max(0, side.length - 1) * padding;
    const usable = Math.max(0, height - gaps);
    let y = 0;
    return side.map((n) => {
      const value = totals.get(n.id) ?? 0;
      const h = total > 0 ? (value / total) * usable : 0;
      const node: SankeyNode = { id: n.id, label: n.label, side: sideName, x, y, w: nodeWidth, h, value };
      y += h + padding;
      return node;
    });
  };

  const sourceNodes = layoutSide(sources, 0, 'source');
  const targetNodes = layoutSide(targets, Math.max(0, width - nodeWidth), 'target');
  const byId = new Map<string, SankeyNode>();
  for (const n of [...sourceNodes, ...targetNodes]) byId.set(`${n.side}:${n.id}`, n);

  // Ribbons stack within each node in the order the links are given, so the
  // bands on both ends are contiguous and never overlap.
  const sourceCursor = new Map<string, number>();
  const targetCursor = new Map<string, number>();

  const links: SankeyLink[] = [];
  for (const l of input.links) {
    if (!Number.isFinite(l.value) || l.value <= 0) continue;
    const s = byId.get(`source:${l.source}`);
    const t = byId.get(`target:${l.target}`);
    if (!s || !t) continue;
    const sTotal = totals.get(l.source) ?? 0;
    const tTotal = totals.get(l.target) ?? 0;
    if (sTotal <= 0 || tTotal <= 0) continue;

    const sOffset = sourceCursor.get(l.source) ?? 0;
    const tOffset = targetCursor.get(l.target) ?? 0;
    // Thickness is set by the source side so a ribbon has one width; the target
    // band is scaled to its own node so the bands fill each node exactly.
    const wS = (l.value / sTotal) * s.h;
    const wT = (l.value / tTotal) * t.h;

    links.push({
      source: l.source,
      target: l.target,
      value: l.value,
      y0: s.y + sOffset + wS / 2,
      y1: t.y + tOffset + wT / 2,
      width: Math.max(wS, 0.5),
      x0: s.x + s.w,
      x1: t.x,
    });

    sourceCursor.set(l.source, sOffset + wS);
    targetCursor.set(l.target, tOffset + wT);
  }

  return { nodes: [...sourceNodes, ...targetNodes], links, width, height };
}

/** Cubic Bézier path for a ribbon's centre line. */
export function ribbonPath(link: SankeyLink): string {
  const mid = (link.x0 + link.x1) / 2;
  return `M${link.x0},${link.y0} C${mid},${link.y0} ${mid},${link.y1} ${link.x1},${link.y1}`;
}
