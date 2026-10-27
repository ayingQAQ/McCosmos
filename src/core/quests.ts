import { nutrientKeys, nutrientNames, stableHash, type Dataset, type NutritionGraph, type NutrientKey } from '../data/schema';
import { algorithm, compareFoods, compareIds, connectedComponents, findRoute, normalizeFoods } from '../graph/analysis';
export interface DailyQuest { id: string; type: 'twins' | 'nutrient' | 'route'; title: string; description: string; available: boolean; candidates: string[]; pair?: [string, string]; nutrient?: NutrientKey; threshold?: number; clue: string }
export function datasetVersion(dataset: Dataset): string {
  const identity = JSON.stringify({ meta: dataset.meta, foods: [...dataset.foods].sort((a, b) => compareIds(a.id, b.id)) });
  return `${dataset.meta.mode}:${dataset.meta.fetchedAt ?? 'local'}:${stableHash(identity).toString(36)}`;
}
export function localDateKey(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function createDailyQuests(dataset: Dataset, graph: NutritionGraph, date: string): DailyQuest[] {
  const version = datasetVersion(dataset), seed = stableHash(`${date}:${version}`);
  const ids = new Set(dataset.foods.map(food => food.id));
  const nodes = graph.nodes.filter(food => ids.has(food.id)).sort((a, b) => compareIds(a.id, b.id));
  const safeGraph = { nodes, edges: graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
  const base = (type: DailyQuest['type'], title: string, description: string): DailyQuest => ({ id: `${date}:${version}:${type}`, type, title, description, available: false, candidates: [], clue: '当前数据不足，暂时无法生成可完成的任务。' });
  const twins = base('twins', '发现双生星', '找到跨类别、营养相似度至少 80 的两颗星球。');
  const nutrient = base('nutrient', '寻找营养星', '找到指定营养原始值排名前三的星球之一。');
  const route = base('route', '打通星际航线', '使用航线工具连接指定的两颗星球。');
  const quests = [twins, nutrient, route];
  if (nodes.length < 3) return quests;

  const normalized = normalizeFoods(nodes);
  const pairs: [string, string][] = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (a.category !== 'other' && b.category !== 'other' && a.category !== b.category && (compareFoods(a, b, normalized)?.score ?? 0) >= algorithm.twinsThreshold) pairs.push([a.id, b.id]);
  }
  if (pairs.length) {
    twins.pair = pairs[seed % pairs.length];
    twins.threshold = algorithm.twinsThreshold;
    twins.candidates = [...new Set(pairs.flat())].sort(compareIds);
    twins.available = true;
    twins.clue = `试试 ${nodes.find(food => food.id === twins.pair![0])!.name} 与另一类别的星球。`;
  }

  // Do not rank values carrying different unit guarantees in the same list.
  const eligibleKeys = nutrientKeys.filter(key => {
    const measured = nodes.filter(food => food.nutrition[key] !== null && Number.isFinite(food.nutrition[key]));
    return measured.length >= 3 && (key === 'kcal' || measured.every(food => food.basis.unitsVerified === measured[0].basis.unitsVerified));
  });
  if (eligibleKeys.length) {
    const key = eligibleKeys[seed % eligibleKeys.length];
    nutrient.nutrient = key;
    nutrient.candidates = nodes.filter(food => food.nutrition[key] !== null && Number.isFinite(food.nutrition[key])).sort((a, b) => b.nutrition[key]! - a.nutrition[key]! || compareIds(a.id, b.id)).slice(0, 3).map(food => food.id);
    nutrient.description = `找出${nutrientNames[key]}原始值排名前三的星球之一；同值按稳定 ID 排序。`;
    nutrient.clue = `在图鉴或实验室查看${nutrientNames[key]}原始值，缺失项不参与排名。`;
    nutrient.available = true;
  }

  const routes: [string, string][] = [];
  const components = connectedComponents(safeGraph);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (components.get(nodes[i].id) === components.get(nodes[j].id)) routes.push([nodes[i].id, nodes[j].id]);
  }
  if (routes.length) {
    route.pair = routes[seed % routes.length];
    route.candidates = [...route.pair];
    route.available = true;
    route.clue = '进入星系，使用指定起点与终点规划航线；反向规划也可以。';
  }
  return quests;
}

export function validateQuest(quest: DailyQuest, selection: string[], graph: NutritionGraph, action: 'check' | 'route-planned' = 'check'): boolean {
  if (!quest.available || new Set(selection).size !== selection.length) return false;
  const nodes = new Map(graph.nodes.map(food => [food.id, food]));
  if (!selection.length || selection.some(id => !nodes.has(id))) return false;
  if (quest.type === 'nutrient') {
    if (selection.length !== 1 || !quest.nutrient || !quest.candidates.includes(selection[0])) return false;
    const ranked = graph.nodes.filter(food => food.nutrition[quest.nutrient!] !== null && Number.isFinite(food.nutrition[quest.nutrient!]));
    if (ranked.length < 3) return false;
    if (quest.nutrient !== 'kcal' && !ranked.every(food => food.basis.unitsVerified === ranked[0].basis.unitsVerified)) return false;
    ranked.sort((a, b) => b.nutrition[quest.nutrient!]! - a.nutrition[quest.nutrient!]! || compareIds(a.id, b.id));
    return ranked.slice(0, 3).some(food => food.id === selection[0]);
  }
  if (selection.length !== 2) return false;
  if (quest.type === 'twins') {
    const a = nodes.get(selection[0])!, b = nodes.get(selection[1])!;
    const score = compareFoods(a, b, normalizeFoods(graph.nodes))?.score;
    return a.category !== 'other' && b.category !== 'other' && a.category !== b.category && score !== undefined && score >= Math.max(algorithm.twinsThreshold, quest.threshold ?? algorithm.twinsThreshold);
  }
  if (quest.type !== 'route' || action !== 'route-planned' || !quest.pair || quest.pair[0] === quest.pair[1]) return false;
  if (!((selection[0] === quest.pair[0] && selection[1] === quest.pair[1]) || (selection[0] === quest.pair[1] && selection[1] === quest.pair[0]))) return false;
  const path = findRoute(graph, selection[0], selection[1]);
  return path !== null && path.length >= 2;
}
