export class UF {
  parent: Uint32Array;
  size: Uint32Array;
  constructor(n: number) {
    this.parent = new Uint32Array(n);
    this.size = new Uint32Array(n);
    for (let i = 0; i < n; i++) { this.parent[i] = i; this.size[i] = 1; }
  }
  find(x: number): number {
    while (this.parent[x] !== x) { this.parent[x] = this.parent[this.parent[x]]; x = this.parent[x]; }
    return x;
  }
  union(a: number, b: number) {
    a = this.find(a); b = this.find(b); if (a === b) return;
    if (this.size[a] < this.size[b]) { const t = a; a = b; b = t; }
    this.parent[b] = a; this.size[a] += this.size[b];
  }
}

export function labelComponents(labels: Uint32Array, w: number, h: number) {
  const comp = new Int32Array(w * h); comp.fill(-1);
  const compLabelBin: number[] = [];
  const compSize: number[] = [];
  let comps = 0;

  const stackX: number[] = [];
  const stackY: number[] = [];
  const idx = (x: number, y: number) => y * w + x;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      if (comp[i] !== -1) continue;
      const bin = labels[i];
      let curSize = 0;
      stackX.length = 0; stackY.length = 0;
      stackX.push(x); stackY.push(y);
      comp[i] = comps;

      while (stackX.length) {
        const cx = stackX.pop()!; const cy = stackY.pop()!;
        curSize++;
        const neighbors = [
          [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = idx(nx, ny);
          if (comp[j] !== -1) continue;
          if (labels[j] !== bin) continue;
          comp[j] = comps;
          stackX.push(nx); stackY.push(ny);
        }
      }
      compLabelBin.push(bin);
      compSize.push(curSize);
      comps++;
    }
  }

  return { comp, compLabelBin, compSize, comps };
}

/** Строим соседство компонент (граница в пикселях) */
export function buildAdjacency(
  comp: Int32Array,
  w: number,
  h: number,
  _comps: number // подчёркнутый — чтобы линтер не ругался если не используется
) {
  void _comps;
  const adj = new Map<number, Map<number, number>>();
  const idx = (x: number, y: number) => y * w + x;

  const inc = (a: number, b: number) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Map());
    const m = adj.get(a)!;
    m.set(b, (m.get(b) || 0) + 1);
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      const c = comp[i];
      if (x + 1 < w) { const r = comp[i + 1]; if (r !== c) { inc(c, r); inc(r, c); } }
      if (y + 1 < h) { const d = comp[i + w]; if (d !== c) { inc(c, d); inc(d, c); } }
    }
  }
  return adj;
}

/** Помечаем компоненты, в которых есть центр отверстия.
 *  pitchPx — шаг отверстий в пикселях превью (8мм * px/мм)
 */
export function componentsWithHole(
  comp: Int32Array,
  w: number,
  h: number,
  comps: number,
  pitchPx: number
) {
  const hasHole = new Array<boolean>(comps).fill(false);
  const start = pitchPx; // первый центр на 8 мм от краёв
  const idx = (x: number, y: number) => y * w + x;

  for (let y = start; y < h; y += pitchPx) {
    for (let x = start; x < w; x += pitchPx) {
      const xi = Math.round(x);
      const yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue;
      const id = comp[idx(xi, yi)];
      if (id >= 0) hasHole[id] = true;
    }
  }
  return hasHole;
}

/** labels -> оптимизированные labels. palette и bins берём из сегментации. */
export function performOptimization(
  labels: Uint32Array,
  w: number,
  h: number,
  minPx: number,
  palette: Uint8Array,
  pitchPx: number
) {
  const { comp, compLabelBin, compSize, comps } = labelComponents(labels, w, h);
  const adj = buildAdjacency(comp, w, h, comps);
  const hasHole = componentsWithHole(comp, w, h, comps, pitchPx);
  const uf = new UF(comps);

  function bestNeighbor(a: number): number | null {
    const m = adj.get(a) || new Map<number, number>();
    let bestId: number | null = null;
    let bestEdge = -1;
    for (const [b, edge] of m) {
      if (edge > bestEdge) { bestEdge = edge; bestId = b; }
    }
    return bestId;
  }

  let changed = true, iter = 0;
  const MAX_ITERS = 5;

  while (changed && iter < MAX_ITERS) {
    changed = false; iter++;
    for (let a = 0; a < comps; a++) {
      const okArea = compSize[a] >= minPx;
      const okHole = hasHole[a];
      if (okArea && okHole) continue;
      const nb = bestNeighbor(a);
      if (nb == null) continue;
      uf.union(a, nb);
      changed = true;
    }
  }

  const remap = new Int32Array(comps);
  for (let a = 0; a < comps; a++) remap[a] = uf.find(a);

  const bins = Math.floor(palette.length / 3);
  const sumR = new Float64Array(comps);
  const sumG = new Float64Array(comps);
  const sumB = new Float64Array(comps);
  const count = new Float64Array(comps);

  for (let i = 0; i < labels.length; i++) {
    const cid = comp[i];
    const root = remap[cid];
    let bin = compLabelBin[cid];
    if (bin < 0) bin = 0;
    if (bin >= bins) bin = bins - 1;
    const base = bin * 3;
    sumR[root] += palette[base];
    sumG[root] += palette[base + 1];
    sumB[root] += palette[base + 2];
    count[root] += 1;
  }

  const avgColor: Array<[number, number, number]> = new Array(comps);
  for (let a = 0; a < comps; a++) {
    avgColor[a] = count[a] > 0
      ? [sumR[a] / count[a], sumG[a] / count[a], sumB[a] / count[a]]
      : [0, 0, 0];
  }

  const outLabels = new Uint32Array(labels.length);
  for (let i = 0; i < labels.length; i++) {
    const cid = comp[i];
    const root = remap[cid];
    const [r, g, b] = avgColor[root];

    let best = 0, bestDist = 1e9;
    for (let bidx = 0; bidx < bins; bidx++) {
      const base = bidx * 3;
      const rr = palette[base], gg = palette[base + 1], bb = palette[base + 2];
      const d = (rr - r) ** 2 + (gg - g) ** 2 + (bb - b) ** 2;
      if (d < bestDist) { bestDist = d; best = bidx; }
    }
    outLabels[i] = best;
  }

  return outLabels;
}
