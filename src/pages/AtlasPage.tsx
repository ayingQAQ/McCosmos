import { McBrandTab } from '../components/McBrand';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { categories, categoryNames, nutrientKeys, type FoodPlanet } from '../data/schema';
import { useFood } from '../state/FoodProvider';
import { FoodCard } from '../components/FoodCard';
import { FoodDetails } from '../components/FoodDetails';
import { Icon } from '../components/Illustrations';
import { groupFoodVariants } from '../data/foodVariants';
import { getFoodImage } from '../data/foodImages';

export default function AtlasPage() {
  const { dataset, state, foodById, visitFood } = useFood();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '', category = params.get('category') ?? 'all', foodId = params.get('food');
  const [complete, setComplete] = useState(false), [sort, setSort] = useState('name'), [limit, setLimit] = useState(24);
  const food = foodId ? foodById.get(foodId) : undefined;
  useEffect(() => { if (food) visitFood(food.id); }, [food, visitFood]);
  // Typing replaces the current history entry; tabs and archives still create entries for Back.
  function update(key: string, value: string, replace = false) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace }); if (key !== 'food') setLimit(24);
  }
  const photoCount = useMemo(() => dataset.foods.filter(food => getFoodImage(food.id)).length, [dataset]);
  const groups = useMemo(() => groupFoodVariants(dataset.foods), [dataset]);
  const counts = useMemo(() => new Map<string, number>([['all', groups.length], ['favorites', groups.filter(group => group.variants.some(food => state.favoriteIds.includes(food.id))).length], ...categories.map(key => [key, groups.filter(group => group.food.category === key).length] as [string, number])]), [groups, state.favoriteIds]);
  const matches = useMemo(() => {
    const result = groupFoodVariants(dataset.foods.filter(item => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
      && (category === 'all' || category === 'favorites' ? category !== 'favorites' || state.favoriteIds.includes(item.id) : item.category === category)
      && (!complete || nutrientKeys.every(key => item.nutrition[key] !== null))));
    const compare = (a: FoodPlanet, b: FoodPlanet) => {
      const key = sort === 'protein-desc' ? 'proteinG' : 'kcal';
      const av = a.nutrition[key], bv = b.nutrition[key];
      if (av === null) return bv === null ? a.id.localeCompare(b.id) : 1;
      if (bv === null) return -1;
      return (sort === 'kcal-asc' ? av - bv : bv - av) || a.id.localeCompare(b.id);
    };
    return result.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'zh-CN') || a.food.id.localeCompare(b.food.id) : compare(a.food, b.food));
  }, [dataset, query, category, state.favoriteIds, complete, sort]);
  function reset() { const next = new URLSearchParams(params); next.delete('q'); next.delete('category'); setParams(next); setComplete(false); setSort('name'); setLimit(24); }
  const filtered = !!query || category !== 'all' || complete;
  return <main className={`atlas-page page-section${food ? ' has-details' : ''}`}>
    <header className="page-heading"><McBrandTab/><p className="eyebrow">FIELD NOTES / 03</p><h1>星球图鉴</h1><p>同款饮品合在一张卡片，点开档案可切换杯型、收藏或加入实验台。</p></header>
    {foodId && !food && <section className="empty-state paper" role="alert"><h2>找不到这颗星球</h2><p>此链接的餐品 ID 不在当前数据集中。</p><button className="button" onClick={() => update('food', '')}>返回当前图鉴</button></section>}
    <section className="atlas-controls paper" aria-label="图鉴筛选">
      <div className="atlas-search-row">
        <label className="atlas-search"><Icon name="search" size={17}/><input type="search" aria-label="图鉴搜索" value={query} placeholder="输入餐品名称筛选" onChange={event => update('q', event.target.value, true)}/></label>
        <label className="atlas-sort">排列<select aria-label="图鉴排序" value={sort} onChange={event => { setSort(event.target.value); setLimit(24); }}><option value="name">名称</option><option value="kcal-desc">热量高 → 低</option><option value="kcal-asc">热量低 → 高</option><option value="protein-desc">蛋白质高 → 低</option></select></label>
        <label className="atlas-complete"><input type="checkbox" checked={complete} onChange={event => { setComplete(event.target.checked); setLimit(24); }}/>仅有完整营养数据</label>
      </div>
      <div className="atlas-tabs" role="group" aria-label="图鉴分类">{[['all', '全部'], ...categories.map(key => [key, categoryNames[key]]), ['favorites', '已收藏']].map(([key, label]) => <button key={key} className="button" aria-pressed={category === key} onClick={() => update('category', key)}>{label}<small aria-hidden="true">{counts.get(key) ?? 0}</small></button>)}</div>
      <p className="atlas-count" aria-live="polite">找到 {matches.length} 颗星球 · 已展示 {Math.min(limit, matches.length)} 颗{filtered && <button className="text-link" onClick={reset}>清除筛选</button>}</p>
    </section>
    {matches.length ? <div className="atlas-grid">{matches.slice(0, limit).map(group => <FoodCard key={group.food.id} food={group.food} displayName={group.name} variantCount={group.variants.length} current={group.variants.some(item => item.id === foodId)} onOpen={() => update('food', group.food.id)}/>)}</div> : <div className="empty-state paper"><h2>这一页还没有星球</h2><p>试试其他名称或分类；收藏后可在「已收藏」中找到。</p><button className="button" onClick={reset}>重置筛选</button></div>}
    {matches.length > limit && <button className="button atlas-more" onClick={() => setLimit(value => value + 24)}>再翻 24 颗星球 <small>还剩 {matches.length - limit}</small></button>}
    <aside className="atlas-notes"><p>当前 {dataset.foods.length} 条原始规格中，{photoCount} 条有已审核图片，{dataset.foods.length-photoCount} 条暂无已核实图片；同款尺寸参考已单独标注。</p><p>分类由项目根据名称推断，卡片插画为通用示意。收藏和浏览记录仅保存在当前浏览器，清除浏览器数据后会消失。缺失营养值始终排在末尾；完整表示五项指标有值，不代表单位或每份口径已核实。</p><p>{dataset.meta.mode === 'synthetic-demo' ? '演示数据（非官方）' : '官方数据快照'} · {dataset.meta.source} · {dataset.meta.fetchedAt ?? '获取时间未提供'}。未核实单位按「原始值」显示。</p></aside>
    {food && <FoodDetails foodId={food.id} onClose={() => update('food', '')} onVariantSelect={id => update('food', id)}/>}
  </main>;
}
