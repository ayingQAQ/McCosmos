import { McBrandMark } from '../components/McBrand';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { categories, categoryNames, nutrientKeys, nutrientNames, type SimilarityEdge } from '../data/schema';
import { discover, findRoute } from '../graph/analysis';
import { layoutGraph } from '../graph/layout';
import { selectionFilters, visibleIds } from '../graph/view';
import { palette } from '../art/planets';
import { GalaxyCanvas } from '../components/GalaxyCanvas';
import { FoodDetails } from '../components/FoodDetails';
import { Icon, PlanetStamp } from '../components/Illustrations';
import { Modal } from '../components/Modal';
import { useFood } from '../state/FoodProvider';
type Overlay = 'about' | 'twins' | 'lonely' | null;
export default function GalaxyPage() {
  const {dataset,graph,foodById,currentLens:lens,setCurrentLens:setLens,categoryFilter:category,setCategoryFilter:setCategory,visitFood,recordRoute,notify}=useFood();
  const positions=useMemo(()=>layoutGraph(graph),[graph]);
  const discoveries=useMemo(()=>discover(dataset.foods),[dataset]);
  const [params,setParams]=useSearchParams(); const navigate=useNavigate();
  const fromParam=params.get('from')??'',toParam=params.get('to')??'';
  const selected=params.get('focus');
  function setSelected(id:string|null){const next=new URLSearchParams(params);if(id){next.set('focus',id);next.delete('guide');}else next.delete('focus');setParams(next);}
  function onModeChange(){const next=new URLSearchParams();if(dataset.meta.mode==='official-snapshot')next.set('demo','1');navigate({pathname:'/galaxy',search:next.toString()});}
  const [highlight, setHighlight] = useState<SimilarityEdge | null>(null);
  const [relationExplanation,setRelationExplanation]=useState<SimilarityEdge|null>(null);
  const [query, setQuery] = useState('');
  const [overlay, setOverlay] = useState<Overlay>(null), [filtersOpen, setFiltersOpen] = useState(false);
  const [showRelations, setShowRelations] = useState(true), [showLabels, setShowLabels] = useState(false), [expanded, setExpanded] = useState(false);
  const [routeOpen, setRouteOpen] = useState(!!params.get('from')), [from, setFrom] = useState(params.get('from')??''), [to, setTo] = useState(params.get('to')??''), [route, setRoute] = useState<string[]>([]), [routeStep, setRouteStep] = useState(0), [routeMessage, setRouteMessage] = useState('');
  const [panelOpen,setPanelOpen]=useState(true);
  const [categoryFocusKey,setCategoryFocusKey]=useState(0);
  function chooseCategory(next:typeof category){setCategory(next);setHighlight(null);setSelected(null);setCategoryFocusKey(value=>value+1);}
  const [playing,setPlaying]=useState(false),[guide,setGuide]=useState(params.get('guide')==='1');
  // In-map panels cover the lower part of the canvas; the camera frames focus targets above them.
  const dock=useRef<HTMLDivElement>(null),panel=useRef<HTMLElement>(null);
  const viewInsets=()=>({left:panel.current&&getComputedStyle(panel.current).position==='absolute'?panel.current.offsetLeft+panel.current.offsetWidth:0,bottom:dock.current?.offsetHeight?dock.current.offsetHeight+70:0});
  const filtered = useMemo(() => dataset.foods.filter(food => (category === 'all' || food.category === category) && food.name.toLowerCase().includes(query.trim().toLowerCase())), [dataset, category, query]);
  const visible = useMemo(() => visibleIds(filtered.map(f => f.id), route, highlight), [filtered, route, highlight]);
  const searchResults = query.trim() ? filtered.slice(0, 40) : filtered.filter(f => /^(巨无霸|中薯条|麦香鱼|猪柳蛋麦满分)$/.test(f.name));
  const currentFood = selected ? foodById.get(selected) : undefined;
  const official = dataset.meta.mode === 'official-snapshot';
  useEffect(()=>{const food=selected?foodById.get(selected):undefined;if(food){visitFood(food.id);setQuery('');setCategory(current=>current==='all'||current===food.category?current:'all');}},[selected,foodById,visitFood,setCategory]);
  useEffect(()=>{setFrom(fromParam);setTo(toParam);setRouteOpen(!!(fromParam||toParam));if(fromParam||toParam)setFiltersOpen(true);setRoute([]);setRouteMessage('');setRouteStep(0);setPlaying(false);},[fromParam,toParam]);
  useEffect(() => {
    if (!route.length||!playing) return;
    const timer = setInterval(() => setRouteStep(step => { if (step >= route.length - 1) { clearInterval(timer);setPlaying(false); return step; } return step + 1; }), 900);
    return () => clearInterval(timer);
  }, [route,playing]);
  function select(id: string | null) { const food = id ? foodById.get(id) : undefined; if (food) { const filters = selectionFilters(food, query, category); setQuery(filters.query); setCategory(filters.category); } setHighlight(null); setSelected(id); setExpanded(false); setFiltersOpen(false); if (id) setGuide(false); }
  function planRoute() {
    const found = findRoute(graph, from, to); setHighlight(null); setRouteStep(0);setPlaying(false); setRoute(found ?? []);
    setRouteMessage(found ? `${found.length - 1} 跳 · 营养相近的最少关系路线` : !from || !to ? '请先选择两颗星球' : '暂时没有可达的营养航线');
    if (found) { recordRoute(from,to);setSelected(null); setQuery(''); setFiltersOpen(false); }
  }
  function endpoint(which: 'from' | 'to', id: string) {
    if (which === 'from') setFrom(id); else setTo(id);const next=new URLSearchParams(params);if(id)next.set(which,id);else next.delete(which);next.delete('focus');setParams(next);setRouteOpen(true);setFiltersOpen(true);
    const other = which === 'from' ? to : from;
    if (id) notify(other ? `${which === 'from' ? '起点' : '终点'}已就位，点「出发」连接两颗星` : `已设为${which === 'from' ? '起点' : '终点'}，再选一颗${which === 'from' ? '终点' : '起点'}`);
    // The route form sits low in the sidebar; bring it into view so the next step is obvious.
    requestAnimationFrame(() => document.querySelector('.route-form')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }
  function closeGuide() { setGuide(false); if (params.has('guide')) { const next = new URLSearchParams(params); next.delete('guide'); setParams(next, { replace: true }); } }
  function exitRoute() { setPlaying(false); setRoute([]); setRouteMessage(''); }
  const routeEdge = routeStep > 0 ? graph.edges.find(e => [e.source, e.target].includes(route[routeStep]) && [e.source, e.target].includes(route[routeStep - 1])) : undefined;
  return <>
    <main className={`galaxy-stage workspace ${filtersOpen ? 'filters-open' : ''}${panelOpen ? '' : ' panel-collapsed'}`}>
      <section className={`map-paper${currentFood ? ' has-details' : ''}`} aria-label="互动餐品星图">
        <div className="map-top"><div className="map-legend" aria-label="星图图例"><span className="legend-lens"><b>基础大小</b>= {nutrientNames[lens]}</span><span className="legend-count">可探索 {filtered.length} / {dataset.meta.count} 颗</span>{category !== 'all' && <button className="legend-chip" onClick={() => setCategory('all')} aria-label={`清除分类：${categoryNames[category]}`}><span className="category-dot" style={{ background: palette[category] }}/>{categoryNames[category]}<Icon name="close" size={12}/></button>}</div><div className={`source-badge ${official ? '' : 'demo'}`}><span/>{official ? '官方营养快照' : '合成示例数据 · 非官方营养信息'}<button aria-label="查看数据来源" onClick={() => setOverlay('about')}><Icon name="info" size={14}/></button></div></div>
        <aside className="sidebar galaxy-panel" aria-label="星图目录" ref={panel}><div className="panel-head"><h1>营养星系</h1><button className="icon-button panel-toggle" aria-expanded={panelOpen} aria-label={panelOpen ? '收起星图目录' : '展开星图目录'} onClick={() => setPanelOpen(open => !open)}><Icon name={panelOpen ? 'close' : 'filter'} size={16}/></button></div>
          <label className="search-box"><Icon name="search" size={18}/><input type="search" aria-label="搜索餐品" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && searchResults[0]) select(searchResults[0].id); if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); setQuery(''); } }} placeholder="筛选星图里的餐品"/></label>
          <button className="mobile-filter button" onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen}><Icon name="filter" size={16}/> 筛选与图鉴</button>
          {query.trim() && <div className="search-results" aria-label="搜索结果">{searchResults.length ? searchResults.map(food => <button key={food.id} onClick={() => select(food.id)} aria-label={`探索 ${food.name}`}><span className="category-dot" style={{ background: palette[food.category] }}/>{food.name}<Icon name="arrow" size={14}/></button>) : <div className="no-results"><PlanetStamp/><p>还没有找到这颗星球</p><small>换个关键词，或清除分类试试。</small></div>}{filtered.length > 40 && <small>显示前 40 项，请继续输入缩小范围。</small>}</div>}
          <div className="sidebar-body">
            <section className="filter-section"><h2><span>01</span> 选择一片星系 <small>CATEGORY</small></h2><div className="category-filters"><button className={category === 'all' ? 'active all' : 'all'} aria-pressed={category === 'all'} onClick={() => chooseCategory('all')}>全部星球 <span>{dataset.meta.count}</span></button>{categories.map(cat => <button key={cat} aria-label={categoryNames[cat]} className={category === cat ? 'active' : ''} aria-pressed={category === cat} onClick={() => chooseCategory(cat)}><span className="category-dot" style={{ background: palette[cat] }}/>{categoryNames[cat]}<small>{dataset.foods.filter(f => f.category === cat).length}</small></button>)}</div><p className="caption">分类依据餐品名称推断，非官方分类</p></section>
            <section className="filter-section"><h2><span>02</span> 换一副营养透镜 <small>LENS</small></h2><div className="lens-filters">{nutrientKeys.map((key, i) => <button key={key} className={lens === key ? 'active' : ''} aria-pressed={lens === key} onClick={() => setLens(key)}><span className={`lens-symbol lens-${i}`}/>{nutrientNames[key]}</button>)}</div><p className="caption">基础大小随指标变化，远近另有透视缩放 <span className="size-dots">● ● ●</span></p></section>
            <section className="filter-section discoveries"><h2><span>03</span> 跟着好奇心走 <small>DISCOVER</small></h2><button className="discovery-button" aria-label="双生星" onClick={() => setOverlay('twins')}><span className="twin-symbol">◒ ◓</span><span><strong>双生星</strong><small>不同星系，相似滋味</small></span><Icon name="arrow" size={16}/></button><button className="discovery-button" aria-label="孤独星球" onClick={() => setOverlay('lonely')}><span className="lonely-symbol">✧</span><span><strong>孤独星球</strong><small>找一颗与众不同的星</small></span><Icon name="arrow" size={16}/></button></section>
            <button className={`route-toggle button ${routeOpen ? 'active' : ''}`} aria-pressed={routeOpen} onClick={() => setRouteOpen(open => !open)}><Icon name="route"/>规划航线<Icon name="arrow" size={16}/></button>
            {routeOpen && <form className="route-form" onSubmit={event => { event.preventDefault(); planRoute(); }}><label>从哪颗出发<select aria-label="航线起点" value={from} onChange={event => endpoint('from',event.target.value)}><option value="">选择起点</option>{dataset.foods.map(food => <option key={food.id} value={food.id}>{food.name}</option>)}</select></label><label>想去哪里<select aria-label="航线终点" value={to} onChange={event => endpoint('to',event.target.value)}><option value="">选择终点</option>{dataset.foods.map(food => <option key={food.id} value={food.id}>{food.name}</option>)}</select></label><button className="button primary" type="submit">出发，连接两颗星</button></form>}
            <details className="food-directory"><summary><Icon name="list" size={16}/> 餐品图鉴 · {filtered.length} 颗星球</summary><div>{filtered.map(food => <button key={food.id} onClick={() => select(food.id)} aria-label={`探索 ${food.name}`}>{food.name}<span>↗</span></button>)}</div></details>
          </div>
        </aside>
        <GalaxyCanvas category={category} categoryFocusKey={categoryFocusKey} onCategoryFocus={chooseCategory} onOverview={()=>{setQuery('');setCategory('all');setHighlight(null);setSelected(null);}} dataset={dataset} graph={graph} positions={positions} visible={visible} lens={lens} selected={selected} onSelect={select} route={route} routeStep={routeStep} showRelations={showRelations} expanded={expanded} showLabels={showLabels} highlight={highlight} onRelationSelect={setRelationExplanation} insets={viewInsets} fitKey={panelOpen}/>
        {guide && !currentFood && <section className="guide-note paper" aria-label="星系探索引导"><p className="eyebrow">第一次出航</p><ol><li><b>点</b>一颗星球，打开它的档案</li><li><b>左键拖动</b>转动视角，<b>滚轮</b>靠近星团</li><li>左侧<b>换透镜</b>，星球大小随之变化</li><li>档案里可<b>收藏</b>、送进<b>实验室</b>、设为<b>航线</b>端点</li></ol><button className="button primary" onClick={closeGuide}>知道了，开始探索</button></section>}
        {filtered.length === 0 && !route.length && <div className="map-empty"><PlanetStamp/><p>这片星域暂时没有匹配的餐品</p><button className="button" onClick={() => { setQuery(''); setCategory('all'); }}>展开全部星图</button></div>}
        {selected && !currentFood && <div className="map-empty" role="status"><p>没有找到链接中的餐品。</p><button className="button" onClick={() => setSelected(null)}>返回全部星图</button></div>}
        {currentFood && <FoodDetails foodId={currentFood.id} onClose={() => setSelected(null)} onSelect={select} onRouteEndpoint={endpoint}/>}
        <div className="map-dock" ref={dock}>
          {selected&&showRelations&&<details className="accessible-relations"><summary>用列表查看可点击的营养连接</summary>{graph.edges.filter(e=>e.source===selected||e.target===selected).map(edge=><button key={`${edge.source}:${edge.target}`} onClick={()=>setRelationExplanation(edge)}>{foodById.get(edge.source===selected?edge.target:edge.source)?.name} · 相近度 {Math.round(edge.score)} · 查看关系解释</button>)}</details>}
          {relationExplanation&&<section className="relation-note paper" aria-label="关系解释"><div className="dock-head"><h2>{foodById.get(relationExplanation.source)?.name} ↔ {foodById.get(relationExplanation.target)?.name}</h2><b>{Math.round(relationExplanation.score)}<small>/100</small></b></div><p>{relationExplanation.explanation}</p><p className="dock-meta">比较维度：{relationExplanation.comparableKeys.map(k=>nutrientNames[k]).join('、')} · 相近度 {Math.round(relationExplanation.score)}/100</p><button className="button" onClick={()=>setRelationExplanation(null)}>收起关系解释</button></section>}
          {highlight && <section className="discovery-focus paper" aria-label="双生星连接"><div><span>双生星发现</span><strong>{foodById.get(highlight.source)?.name} ↔ {foodById.get(highlight.target)?.name}</strong><b>{Math.round(highlight.score)} / 100</b><button className="icon-button" aria-label="清除双生星连接" onClick={() => setHighlight(null)}><Icon name="close" size={16}/></button></div><p>{highlight.explanation} 紫色虚线标出了这次发现的关系。</p></section>}
          {routeMessage && <section className="route-result paper" aria-label="航线结果"><div className="dock-head"><Icon name="route"/><strong role="status">{routeMessage}</strong><button className="icon-button" aria-label="清除航线" onClick={exitRoute}><Icon name="close" size={16}/></button></div>{route.length > 0 && <><ol>{route.map((id, index) => <li key={id}><button className={index <= routeStep ? 'visited' : ''} aria-current={routeStep === index ? 'step' : undefined} onClick={() => { setPlaying(false); setRouteStep(index); }}><span>{index + 1}</span>{foodById.get(id)?.name}</button></li>)}</ol>
            <div className="route-playback" aria-label="航线播放控制"><button className="button" disabled={routeStep===0} onClick={()=>{setPlaying(false);setRouteStep(s=>Math.max(0,s-1));}}>上一站</button><span>{routeStep+1} / {route.length} · {foodById.get(route[routeStep])?.name}</span><button className="button primary" onClick={()=>{if(routeStep===route.length-1)setRouteStep(0);setPlaying(value=>!value);}}>{playing?'暂停航线':'播放航线'}</button><button className="button" disabled={routeStep>=route.length-1} onClick={()=>{setPlaying(false);setRouteStep(s=>Math.min(route.length-1,s+1));}}>下一站</button><button className="text-link" onClick={exitRoute}>退出航线</button></div>
            <p>{routeEdge ? routeEdge.explanation : '从起点出发，用「下一站」或点击步骤查看每一段营养关系。'}{route.some(id => !filtered.some(f => f.id === id)) ? ' 航线包含筛选外星球，已临时显示。' : ''} 营养相似路径不代表进食建议。</p><button className="text-link" onClick={() => select(route[routeStep])}>打开「{foodById.get(route[routeStep])?.name}」档案 ↗</button></>}</section>}
        </div>
        <div className="galaxy-brand-stamp" aria-hidden="true"><McBrandMark decorative/><span>麦门观测站<small>McCOSMOS / FOOD UNIVERSE</small></span></div>
        <div className="atlas-caption stage-caption"><span><i className="snapshot-dot"/>{official ? `快照更新于 ${dataset.meta.fetchedAt?.slice(0, 10)} · ${dataset.meta.count} 款餐品` : '合成示例数据 · 非官方营养信息'}</span><span>三维空间为视觉示意 · 屏幕大小含透视缩放 · 营养以数值为准</span></div>
        <div className="map-bottom"><div className="display-toggles"><label><input type="checkbox" checked={showRelations} onChange={event => setShowRelations(event.target.checked)}/>显示关系</label><label><input type="checkbox" checked={showLabels} onChange={event => setShowLabels(event.target.checked)}/>显示名称</label>{selected && <button onClick={() => setExpanded(value => !value)}>{expanded ? '收起关系' : '查看更多关系'}</button>}</div><button className="about-button" onClick={() => setOverlay('about')}>这张星图怎么看？ <Icon name="info" size={15}/></button></div>
      </section>
    </main>
    {overlay && <Modal title={overlay === 'about' ? '这张星图怎么看？' : overlay === 'twins' ? '双生星发现' : '孤独星球发现'} onClose={() => setOverlay(null)}>
      {overlay === 'about' ? <div className="about-content"><PlanetStamp/><p>每颗星球是一款餐品。颜色代表本地推断的类别，基础大小表示当前营养指标，屏幕大小还包含透视缩放；空间远近仅为视觉示意。餐品分布在有体积的三维星团中，默认只显示局部空间。左键转动视角，右键平移，滚轮穿梭，或从图鉴选择星球。</p><h3>有根据的连接</h3><p>对五项营养原始值做 log1p 与 P5/P95 缩放，按热量 30%、蛋白质 25%、其余各 15% 计算距离。相似度 = 100 × exp(−距离 / 0.5)。至少三个共同有效指标才可比较，保留分数 ≥50 的前三名关系并取无向边并集。航线按最少跳数搜索，可能没有可达路线。</p><p>相近度是本项目的工程算法，不是官方评分、健康评价或营养建议。不同餐品规格不代表等重量比较。</p><h3>数据来源与边界</h3><p>{dataset.meta.source}<br/>获取时间：{dataset.meta.fetchedAt ?? '不适用（合成示例）'}<br/>原始 {dataset.meta.rawCount} 条 · 当前 {dataset.meta.count} 条</p><ul>{dataset.warnings.map(w => <li key={w}>{w}</li>)}</ul><p>原始数值不补零、不推断份量。非官方产品，餐品及营养信息以官方渠道为准。</p><div className="about-actions"><a href="https://github.com/M-China/mcd-mcp-server" target="_blank" rel="noreferrer">官方 MCP 说明 ↗</a><button className="button" onClick={() => { onModeChange(); setOverlay(null); }}>{official ? '切换到合成演示' : '读取官方快照'}</button></div></div> : overlay === 'twins' ? <div className="discovery-results"><p>来自不同推断类别的餐品，拥有相近的营养轮廓。阈值为 80，最多展示五对。</p>{discoveries.twins.length ? discoveries.twins.map(edge => <button key={`${edge.source}:${edge.target}`} onClick={() => { select(edge.source); setCategory('all'); setHighlight(edge); setRoute([]); setRouteMessage(''); setOverlay(null); }}><PlanetStamp food={foodById.get(edge.source)}/><span><strong>{foodById.get(edge.source)?.name}<br/>↔ {foodById.get(edge.target)?.name}</strong><small>{edge.explanation}</small></span><b>{Math.round(edge.score)}</b></button>) : <p>暂时没有符合条件的双生星。</p>}</div> : <div className="discovery-results"><p>五项数据完整的餐品中，最近邻相似度相对最低的五颗星。这是相对差异排行，不代表绝对独特。</p>{discoveries.lonely.length ? discoveries.lonely.map(item => <button key={item.id} onClick={() => { select(item.id); setCategory('all'); setOverlay(null); }}><PlanetStamp food={foodById.get(item.id)}/><span><strong>{foodById.get(item.id)?.name}</strong><small>与最近邻的相近度 {Math.round(item.nearestScore)} / 100</small></span><Icon name="arrow"/></button>) : <p>完整数据不足，暂时无法发现。</p>}</div>}
    </Modal>}
  </>;
}
