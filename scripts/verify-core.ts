import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { analyze, compareFoods, compareIds, connectedComponents, findRoute, normalizeFoods } from '../src/graph/analysis';
import { createDailyQuests, datasetVersion } from '../src/core/quests';
import { compareRecords } from '../src/cli/workflows';
import { compareNutrition } from '../src/core/comparison';
import { datasetSchema, stableHash, type NutritionGraph } from '../src/data/schema';

const dataset = datasetSchema.parse(JSON.parse(await readFile('public/data/nutrition.snapshot.json', 'utf8')));
const graph = analyze(dataset.foods);
const nodes = [...graph.nodes].sort((a,b)=>compareIds(a.id,b.id));
const started = performance.now();
const quests = createDailyQuests(dataset,graph,'2026-10-27');
const questMs = performance.now()-started;

// Independent oracle: the old BFS definition, including disconnected and isolated nodes.
const cases: NutritionGraph[] = [graph, { nodes: nodes.slice(0,5), edges: [] }, {
  nodes: nodes.slice(0,5), edges: [{ source:nodes[0].id,target:nodes[1].id,score:80,comparableKeys:['kcal','fatG','proteinG'],explanation:'' }],
}];
for (const sample of cases) {
  const components=connectedComponents(sample), pairs: [string,string][]=[];
  for(let i=0;i<sample.nodes.length;i++)for(let j=i+1;j<sample.nodes.length;j++) {
    const a=sample.nodes[i].id,b=sample.nodes[j].id;
    const reachable=findRoute(sample,a,b)!==null;
    assert.equal(components.get(a)===components.get(b),reachable);
    if(reachable)pairs.push([a,b]);
  }
  for(const date of ['2026-10-27','2026-10-28','2026-11-01']) {
    const subset={...dataset,foods:sample.nodes,meta:{...dataset.meta,count:sample.nodes.length}};
    const route=createDailyQuests(subset,sample,date).find(q=>q.type==='route')!;
    assert.equal(route.available,pairs.length>0);
    assert.deepEqual(route.pair,pairs.length?pairs[stableHash(`${date}:${datasetVersion(subset)}`)%pairs.length]:undefined);
  }
}
const a=structuredClone(nodes[0]),b=structuredClone(nodes[1]);
a.basis.unitsVerified=false;b.basis.unitsVerified=true;
const values=normalizeFoods([a,b]);
assert.equal(compareFoods(a,b,values),null,'Shared similarity must reject incompatible unit guarantees');
assert.equal(compareRecords(dataset,a,b).similarity,null);
assert.equal(compareNutrition([a,b]).find(row=>row.key==='proteinG')!.delta,null);
a.nutrition.kcal=0;b.nutrition.kcal=null;
assert.deepEqual(compareNutrition([a,b])[0].values,[0,null]);
assert.equal(compareNutrition([a,b])[0].delta,null);
await mkdir('artifacts/verification',{recursive:true});
await writeFile('artifacts/verification/core.json',JSON.stringify({foods:nodes.length,pairs:nodes.length*(nodes.length-1)/2,questMs,questIds:quests.map(q=>q.id),checks:['BFS equivalence','stable daily route','disconnected graph','mixed units','zero and missing']},null,2));
console.log(`Core verification passed; ${nodes.length} foods; daily quests ${questMs.toFixed(1)}ms (CI runner observation).`);
