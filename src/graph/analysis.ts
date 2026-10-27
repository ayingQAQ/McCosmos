import { nutrientKeys, nutrientNames, type FoodPlanet, type NutritionGraph, type NutrientKey, type SimilarityEdge } from '../data/schema';
export type Normalized = Map<string, Partial<Record<NutrientKey, number>>>;
const weights: Record<NutrientKey, number> = { kcal: .3, proteinG: .25, fatG: .15, carbsG: .15, sodiumMg: .15 };
export const algorithm = { version: '1.0', tau: .5, threshold: 50, twinsThreshold: 80, neighbors: 3 } as const;
export const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
}
export function normalizeFoods(foods: FoodPlanet[]): Normalized {
  const result: Normalized = new Map(foods.map(food => [food.id, {}]));
  for (const key of nutrientKeys) {
    const sorted = foods.flatMap(f => f.nutrition[key] === null ? [] : [Math.log1p(f.nutrition[key]!)]).sort((a, b) => a - b);
    const low = quantile(sorted, .05), high = quantile(sorted, .95);
    for (const food of foods) {
      const value = food.nutrition[key];
      if (value !== null) result.get(food.id)![key] = high === low ? .5 : Math.max(0, Math.min(1, (Math.log1p(value) - low) / (high - low)));
    }
  }
  return result;
}
export function compareFoods(a: FoodPlanet, b: FoodPlanet, values: Normalized): { score: number; comparableKeys: NutrientKey[] } | null {
  if (a.basis.unitsVerified !== b.basis.unitsVerified) return null;
  const av = values.get(a.id), bv = values.get(b.id);
  if (!av || !bv) return null;
  const comparableKeys = nutrientKeys.filter(key => av[key] !== undefined && bv[key] !== undefined);
  if (comparableKeys.length < 3) return null;
  const total = comparableKeys.reduce((sum, key) => sum + weights[key], 0);
  const distance = Math.sqrt(comparableKeys.reduce((sum, key) => sum + weights[key] / total * (av[key]! - bv[key]!) ** 2, 0));
  return { score: 100 * Math.exp(-distance / algorithm.tau), comparableKeys };
}
function makeEdge(a: FoodPlanet, b: FoodPlanet, values: Normalized): SimilarityEdge | null {
  const comparison = compareFoods(a, b, values);
  if (!comparison) return null;
  const closest = [...comparison.comparableKeys].sort((x, y) => Math.abs(values.get(a.id)![x]! - values.get(b.id)![x]!) - Math.abs(values.get(a.id)![y]! - values.get(b.id)![y]!)).slice(0, 2);
  return { source: a.id, target: b.id, ...comparison, explanation: `比较 ${comparison.comparableKeys.length}/5 项指标；${closest.map(k => `${nutrientNames[k]}原始值差 ${Number(Math.abs(a.nutrition[k]! - b.nutrition[k]!).toFixed(1))}`).join('、')}。这是营养轮廓相近程度，不是健康评分。` };
}
export function analyze(foods: FoodPlanet[]): NutritionGraph {
  const nodes = [...foods].sort((a, b) => compareIds(a.id, b.id));
  const values = normalizeFoods(nodes), edges = new Map<string, SimilarityEdge>();
  for (const a of nodes) {
    const candidates = nodes.filter(b => a.id !== b.id).flatMap(b => { const e = makeEdge(a, b, values); return e && e.score >= algorithm.threshold ? [e] : []; }).sort((x, y) => y.score - x.score || compareIds(x.target, y.target)).slice(0, algorithm.neighbors);
    for (const edge of candidates) {
      const [source, target] = [edge.source, edge.target].sort(compareIds);
      edges.set(`${source}:${target}`, { ...edge, source, target });
    }
  }
  return { nodes, edges: [...edges.values()].sort((a, b) => compareIds(a.source, b.source) || compareIds(a.target, b.target)) };
}
export function neighbors(graph: NutritionGraph, id: string, limit = 3): SimilarityEdge[] {
  return graph.edges.filter(e => e.source === id || e.target === id).sort((a, b) => b.score - a.score || compareIds(a.source === id ? a.target : a.source, b.source === id ? b.target : b.source)).slice(0, limit);
}
export function findRoute(graph: NutritionGraph, from: string, to: string): string[] | null {
  const ids = new Set(graph.nodes.map(n => n.id));
  if (!ids.has(from) || !ids.has(to)) return null;
  if (from === to) return [from];
  const adjacency = new Map([...ids].map(id => [id, [] as string[]]));
  for (const e of graph.edges) { adjacency.get(e.source)?.push(e.target); adjacency.get(e.target)?.push(e.source); }
  for (const list of adjacency.values()) list.sort(compareIds);
  const previous = new Map<string, string | null>([[from, null]]), queue = [from];
  for (let i = 0; i < queue.length; i++) {
    for (const next of adjacency.get(queue[i]) ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, queue[i]);
      if (next === to) {
        const path = [to]; let current: string | null = queue[i];
        while (current !== null) { path.push(current); current = previous.get(current) ?? null; }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}
/** Reachability needs one traversal, not a new BFS for every pair of foods. */
export function connectedComponents(graph: NutritionGraph): Map<string, number> {
  const adjacency = new Map(graph.nodes.map(node => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) continue;
    adjacency.get(edge.source)!.push(edge.target);
    adjacency.get(edge.target)!.push(edge.source);
  }
  const components = new Map<string, number>();
  let component = 0;
  for (const id of adjacency.keys()) {
    if (components.has(id)) continue;
    const queue = [id]; components.set(id, component);
    for (let i = 0; i < queue.length; i++) {
      for (const next of adjacency.get(queue[i])!) {
        if (components.has(next)) continue;
        components.set(next, component); queue.push(next);
      }
    }
    component++;
  }
  return components;
}
export function discover(foods: FoodPlanet[]): { twins: SimilarityEdge[]; lonely: { id: string; nearestScore: number }[] } {
  const sorted = [...foods].sort((a, b) => compareIds(a.id, b.id)), values = normalizeFoods(sorted);
  const twins: SimilarityEdge[] = [], nearest = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    const a = sorted[i], b = sorted[j], edge = makeEdge(a, b, values);
    if (!edge) continue;
    if (a.category !== 'other' && b.category !== 'other' && a.category !== b.category && edge.score >= algorithm.twinsThreshold) twins.push(edge);
    if (nutrientKeys.every(k => a.nutrition[k] !== null && b.nutrition[k] !== null)) {
      nearest.set(a.id, Math.max(nearest.get(a.id) ?? 0, edge.score)); nearest.set(b.id, Math.max(nearest.get(b.id) ?? 0, edge.score));
    }
  }
  return { twins: twins.sort((a, b) => b.score - a.score || compareIds(a.source, b.source) || compareIds(a.target, b.target)).slice(0, 5), lonely: [...nearest].map(([id, nearestScore]) => ({ id, nearestScore })).sort((a, b) => a.nearestScore - b.nearestScore || compareIds(a.id, b.id)).slice(0, 5) };
}
