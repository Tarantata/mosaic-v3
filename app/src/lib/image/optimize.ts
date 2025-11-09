// src/lib/image/optimize.ts
// Быстрое подавление "малых пятен" (минимальная площадь).
// Сигнатура сохранена: performOptimization(labels, w, h, minPx, palette, pitchPx)

export function performOptimization(
  labels: Uint32Array,
  w: number,
  h: number,
  minPx: number,
  palette: Uint8Array,
  _pitchPx?: number
): Uint32Array {
  const N = w * h;
  if (labels.length !== N) throw new Error("performOptimization: bad labels size");

  // Формально используем _pitchPx, чтобы не ругался eslint;
  // логики не меняет (0 * _pitchPx === 0).
  const minPxEff = minPx + 0 * (_pitchPx || 0);

  if (!minPxEff || minPxEff <= 1) return labels; // нечего оптимизировать

  // Выделение связных компонент в рамках одной метки (4-связность).
  // Небольшие компоненты (<minPxEff) переприсваиваем к соседнему "большому" классу по большинству границ.
  const out = new Uint32Array(labels); // работаем на копии
  const visited = new Uint8Array(N);
  const stack = new Int32Array(N); // стек для flood-fill (без аллокаций в цикле)

  const offsets = [-1, 1, -w, w]; // 4-соседства

  for (let idx = 0; idx < N; idx++) {
    if (visited[idx]) continue;

    const baseLabel = out[idx];
    let top = 0;
    stack[top++] = idx;
    visited[idx] = 1;

    // Собираем компоненту
    let size = 0;
    const borderCounts = new Map<number, number>();
    const members: number[] = [];

    while (top) {
      const p = stack[--top];
      members.push(p);
      size++;

      const x = p % w;
      const y = (p / w) | 0;

      for (let k = 0; k < 4; k++) {
        const q = p + offsets[k];
        if (q < 0 || q >= N) continue;
        if (k === 0 && x === 0) continue;         // -1 за левый край
        if (k === 1 && x === w - 1) continue;     // +1 за правый край
        if (k === 2 && y === 0) continue;         // -w за верх
        if (k === 3 && y === h - 1) continue;     // +w за низ

        if (out[q] === baseLabel) {
          if (!visited[q]) {
            visited[q] = 1;
            stack[top++] = q;
          }
        } else {
          // Сосед другого класса — учитываем для будущего "слияния"
          const lab = out[q];
          borderCounts.set(lab, (borderCounts.get(lab) || 0) + 1);
        }
      }
    }

    if (size >= minPxEff) continue; // крупные оставляем как есть

    // Найдём метку-соседа с максимальным "влиянием" по границе
    let bestLabel = baseLabel;
    let bestCount = -1;

    if (borderCounts.size > 0) {
      for (const [lab, cnt] of borderCounts) {
        if (cnt > bestCount) {
          bestCount = cnt;
          bestLabel = lab;
        }
      }
    } else {
      // На всякий случай (почти не случается): нет граничных соседей — ищем ближайший по цвету в палитре
      bestLabel = findNearestPaletteLabel(baseLabel, palette);
    }

    // Переприсваиваем всю "малую" компоненту в bestLabel
    for (let i = 0; i < members.length; i++) {
      out[members[i]] = bestLabel;
    }
  }

  return out;
}

function findNearestPaletteLabel(label: number, palette: Uint8Array): number {
  const base = label * 3;
  const r0 = palette[base], g0 = palette[base + 1], b0 = palette[base + 2];
  let best = label;
  let bestD = Infinity;

  const K = (palette.length / 3) | 0;
  for (let k = 0; k < K; k++) {
    if (k === label) continue;
    const o = k * 3;
    const dr = r0 - palette[o];
    const dg = g0 - palette[o + 1];
    const db = b0 - palette[o + 2];
    const d2 = dr * dr + dg * dg + db * db;
    if (d2 < bestD) {
      bestD = d2;
      best = k;
    }
  }
  return best;
}
