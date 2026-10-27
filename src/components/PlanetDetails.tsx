import { useEffect, useRef, useState, type ReactNode } from 'react';
import { categoryNames, formatNutrient, nutrientKeys, nutrientNames, type Dataset, type FoodPlanet, type NutritionGraph } from '../data/schema';
import { neighbors } from '../graph/analysis';
import { exportPlanetCard } from '../art/shareCard';
import { Icon } from './Illustrations';
import { FoodPhoto } from './FoodPhoto';

export function PlanetDetails({ food, dataset, graph, onClose, onSelect, onRouteEndpoint, actions, variantControls }: { food: FoodPlanet; dataset: Dataset; graph: NutritionGraph; onClose: () => void; onSelect: (id: string) => void; onRouteEndpoint: (which: 'from' | 'to', id: string) => void; actions?: ReactNode; variantControls?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null), [exporting, setExporting] = useState(false), [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; heading.current?.focus({ preventScroll: true }); return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); }; }, [food.id]);
  const related = neighbors(graph, food.id);
  async function save() { setExporting(true); setError(''); try { await exportPlanetCard(food, dataset); } catch { setError('图片没有保存成功，请重试或更换浏览器。'); } finally { setExporting(false); } }
  return <aside className={`planet-details paper${expanded ? ' details-expanded' : ''}`} aria-label={`${food.name}星球档案`}>
    <div className="detail-top"><span className="eyebrow">PLANET FIELD NOTES</span><button className="detail-sheet-toggle" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'收起档案，继续探索':'展开餐品档案'} <span aria-hidden="true">{expanded?'⌄':'⌃'}</span></button><button className="icon-button" aria-label="关闭星球档案" onClick={onClose}><Icon name="close"/></button></div>
    <FoodPhoto food={food}/><span className="category-tag">{categoryNames[food.category]} · {food.categorySource === 'inferred' ? '本地推断' : '未分类'}</span>
    <h2 ref={heading} tabIndex={-1}>{food.name}</h2><p className="detail-basis">{food.basis.description}</p>
    {variantControls}
    <dl className="nutrition-values">{nutrientKeys.map(key => <div key={key}><dt>{nutrientNames[key]}</dt><dd>{formatNutrient(food, key)}</dd></div>)}</dl>
    {!food.basis.unitsVerified && <p className="unit-note">蛋白质等字段单位待核实，显示接口原始值。不同餐品规格的相似性不代表等重量比较。</p>}
    {actions}
    <div className="detail-section"><h3>看看它的小伙伴 <span>TOP 3</span></h3>{related.length ? related.map(edge => {
      const id = edge.source === food.id ? edge.target : edge.source, other = graph.nodes.find(n => n.id === id)!;
      return <div className="neighbor" key={id}><button onClick={() => onSelect(id)}><span>{other.name}</span><strong>{Math.round(edge.score)}<small>相近度</small></strong></button><p>{edge.explanation}</p></div>;
    }) : <p className="unit-note">数据不足或没有达到阈值的邻居。</p>}</div>
    <div className="endpoint-actions"><button onClick={() => onRouteEndpoint('from', food.id)}>设为起点</button><button onClick={() => onRouteEndpoint('to', food.id)}>设为终点</button></div>
    <button className="button primary save-card" disabled={exporting} onClick={save}><Icon name="download" size={17}/>{exporting ? '正在画卡片…' : '保存星球卡片'}</button>
    {error && <p role="alert">{error}</p>}<p className="source-note">{dataset.meta.mode === 'official-snapshot' ? `官方营养快照 · ${dataset.meta.fetchedAt?.slice(0, 10)}` : '合成示例数据 · 非官方营养信息'}</p>
  </aside>;
}
