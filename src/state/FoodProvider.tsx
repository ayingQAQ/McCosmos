import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { stableHash, type Dataset, type FoodCategory, type FoodPlanet, type NutrientKey } from '../data/schema';
import { loadDataset } from '../data/loadData';
import { analyze } from '../graph/analysis';
import { createDailyQuests, datasetVersion, localDateKey, validateQuest } from '../core/quests';
import { readPersistentState, type ExplorerState, type QuestStatus } from './persistence';

function useRepository(demo: boolean) {
  const [dataset,setDataset]=useState<Dataset|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{ const controller=new AbortController(); setDataset(null);setError('');loadDataset(demo,controller.signal).then(value=>{if(!controller.signal.aborted)setDataset(value);}).catch(()=>{if(!controller.signal.aborted)setError('无法读取或校验官方营养快照，请重试或主动选择演示模式。');});return()=>controller.abort();},[demo,attempt]);
  return {dataset,error,retry:()=>setAttempt(n=>n+1)};
}
export function RepositoryBoundary({children}:{children:(dataset:Dataset)=>ReactNode}) {
  const [params,setParams]=useSearchParams(); const demo=params.get('demo')==='1'; const {dataset,error,retry}=useRepository(demo);
  if(!dataset)return <main className="load-state paper"><p className="eyebrow">McCOSMOS / SOURCE CHECK</p><h1>{error?'星图暂时没有展开':'正在绘制你的小宇宙…'}</h1><p role={error?'alert':'status'}>{error||'读取同一份营养快照，准备五个探索站。'}</p>{error&&<div className="load-actions"><button className="button" onClick={retry}>重新读取快照</button><button className="button primary" onClick={()=>{const next=new URLSearchParams(params);next.set('demo','1');setParams(next);}}>使用合成演示数据</button></div>}</main>;
  if(!dataset.foods.length)return <main className="load-state paper"><h1>这份快照还没有餐品</h1><p>当前数据为空，无法绘制星图或生成任务。</p><button className="button" onClick={retry}>重新读取快照</button><button className="button primary" onClick={()=>{const next=new URLSearchParams(params);next.set('demo','1');setParams(next);}}>使用合成演示数据</button></main>;
  return <FoodProvider key={dataset.meta.mode} dataset={dataset}>{children(dataset)}</FoodProvider>;
}
function useExplorer(dataset:Dataset) {
  const ids=useMemo(()=>dataset.foods.map(f=>f.id),[dataset]);
  const key=`mccosmos:explorer:v1:${dataset.meta.mode}`;
  const [storageWarning,setStorageWarning]=useState('');
  const [state,setState]=useState<ExplorerState>(()=>{try{return readPersistentState(localStorage.getItem(key),ids);}catch{return readPersistentState(null,ids);}});
  useEffect(()=>{try{const safe=readPersistentState(JSON.stringify(state),ids);localStorage.setItem(key,JSON.stringify(safe));}catch{setStorageWarning('浏览器未允许本地保存；本次操作仍可用，刷新后可能丢失。');}},[ids,key,state]);
  useEffect(()=>{const changed=(event:StorageEvent)=>{if(event.key===key)setState(readPersistentState(event.newValue,ids));};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);},[ids,key]);
  return {state,setState,storageWarning};
}
function useFoodValue(dataset:Dataset) {
  const graph=useMemo(()=>analyze(dataset.foods),[dataset]);
  const version=useMemo(()=>datasetVersion(dataset),[dataset]);
  const foodById=useMemo(()=>new Map(dataset.foods.map(f=>[f.id,f])),[dataset]);
  const {state,setState,storageWarning}=useExplorer(dataset);
  const [currentLens,setCurrentLens]=useState<NutrientKey>('kcal'),[categoryFilter,setCategoryFilter]=useState<FoodCategory|'all'>('all');
  const [selectedFoodId,setSelectedFoodId]=useState<string|null>(null),[notice,setNotice]=useState('');
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(timer);},[notice]);
  const [date,setDate]=useState(()=>localDateKey());
  const [discoveryCount,setDiscoveryCount]=useState(0);
  useEffect(()=>{const timer=setInterval(()=>setDate(localDateKey()),30_000);return()=>clearInterval(timer);},[]);
  const quests=useMemo(()=>createDailyQuests(dataset,graph,date),[dataset,graph,date]);
  const notify=useCallback((message:string)=>setNotice(message),[]);
  const toggleFavorite=useCallback((id:string)=>{if(!foodById.has(id))return;setState(s=>({...s,favoriteIds:s.favoriteIds.includes(id)?s.favoriteIds.filter(x=>x!==id):[...s.favoriteIds,id]}));setNotice('收藏册已更新 · 仅保存在当前浏览器');},[foodById,setState]);
  const visitFood=useCallback((id:string)=>{if(!foodById.has(id))return;setSelectedFoodId(id);setState(s=>s.recentlyViewed[0]===id?s:{...s,recentlyViewed:[id,...s.recentlyViewed.filter(x=>x!==id)].slice(0,6)});},[foodById,setState]);
  const addToLab=useCallback((id:string,replaceId?:string)=>{
    if(!foodById.has(id))return;
    if(state.labSelectedIds.includes(id)){setNotice('这颗星球已经在实验台上了');return;}
    if(replaceId&&state.labSelectedIds.includes(replaceId)){setState(s=>({...s,labSelectedIds:s.labSelectedIds.map(x=>x===replaceId?id:x)}));setNotice('实验槽位已替换');return;}
    if(state.labSelectedIds.length>=3){setNotice('实验台最多 3 颗星球，请到实验室清空或选择一个槽位替换。');return;}
    setState(s=>({...s,labSelectedIds:s.labSelectedIds.length<3&&!s.labSelectedIds.includes(id)?[...s.labSelectedIds,id]:s.labSelectedIds}));setNotice('已加入实验室');
  },[foodById,setState,state.labSelectedIds]);
  const removeFromLab=(id:string)=>{setState(s=>({...s,labSelectedIds:s.labSelectedIds.filter(x=>x!==id)}));setNotice('实验槽位已清空');};
  const clearLab=()=>{setState(s=>({...s,labSelectedIds:[]}));setNotice('实验台已清空');};
  const swapLab=()=>{setState(s=>({...s,labSelectedIds:s.labSelectedIds.length<2?s.labSelectedIds:[s.labSelectedIds[1],s.labSelectedIds[0],...s.labSelectedIds.slice(2)]}));setNotice('前两个槽位已交换');};
  function setQuestStatus(id:string,status:QuestStatus) {setState(s=>{const previous=s.questProgress[id];if(previous==='claimed'||previous==='completed'&&status==='started')return s;if(status==='claimed'&&previous!=='completed')return s;return {...s,questProgress:{...s.questProgress,[id]:status}};});}
  function checkQuest(id:string,selection:string[],action:'check'|'route-planned'='check') {const quest=quests.find(q=>q.id===id);if(!quest||!validateQuest(quest,selection,graph,action)){setNotice('还没有符合任务条件，再看看线索吧。');return false;}setQuestStatus(id,'completed');setNotice('探索成功！回任务页领取星章。');return true;}
  function recordRoute(from:string,to:string){for(const q of quests.filter(q=>q.type==='route'))if(validateQuest(q,[from,to],graph,'route-planned')){setQuestStatus(q.id,'completed');setNotice('航线任务已完成，回探索任务领取星章。');}}
  const setSound=(sound:boolean)=>setState(s=>({...s,sound}));
  function nextDiscovery(){const ordered=[...dataset.foods].sort((a,b)=>a.id.localeCompare(b.id));const index=(stableHash(`${date}:${version}`)+discoveryCount)%ordered.length;setDiscoveryCount(n=>n+1);return ordered[index]?.id;}
  const path=(pathname:string,values:Record<string,string|undefined>={})=>{const params=new URLSearchParams();if(dataset.meta.mode==='synthetic-demo')params.set('demo','1');for(const [key,value] of Object.entries(values))if(value)params.set(key,value);return `${pathname}${params.size?`?${params}`:''}`;};
  return {dataset,graph,foodById,state,storageWarning,currentLens,setCurrentLens,categoryFilter,setCategoryFilter,selectedFoodId,setSelectedFoodId,notice,notify,toggleFavorite,visitFood,addToLab,removeFromLab,clearLab,swapLab,quests,date,version,setQuestStatus,checkQuest,recordRoute,setSound,nextDiscovery,path};
}
type FoodContextValue=ReturnType<typeof useFoodValue>;
const FoodContext=createContext<FoodContextValue|null>(null);
export function FoodProvider({dataset,children}:{dataset:Dataset;children:ReactNode}){const value=useFoodValue(dataset);return <FoodContext.Provider value={value}>{children}</FoodContext.Provider>;}
export function useFood(){const value=useContext(FoodContext);if(!value)throw new Error('FoodProvider is required');return value;}
export type {FoodPlanet};
