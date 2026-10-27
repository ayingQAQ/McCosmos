import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import { RepositoryBoundary, useFood } from '../state/FoodProvider';
import { McBrandMark } from '../components/McBrand';
import { Icon } from '../components/Illustrations';
import { Modal } from '../components/Modal';
import { palette } from '../art/planets';
import { formatNutrient } from '../data/schema';
const ObservatoryPage=lazy(()=>import('../pages/ObservatoryPage'));
const GalaxyPage=lazy(()=>import('../pages/GalaxyPage'));
const AtlasPage=lazy(()=>import('../pages/AtlasPage'));
const LabPage=lazy(()=>import('../pages/LabPage'));
const QuestsPage=lazy(()=>import('../pages/QuestsPage'));

class PageBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<main className="load-state paper" role="alert"><h1>这一站暂时没有展开</h1><p>请重新加载页面，已保存的收藏和实验台会保留。</p><button className="button" onClick={()=>location.reload()}>重新加载</button></main>:this.props.children;}
}

const navigation=[['/','宇宙观测站'],['/galaxy','营养星系'],['/atlas','星球图鉴'],['/lab','营养实验室'],['/quests','探索任务']] as const;
const typing=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
function GlobalSearch(){
  const {dataset,path}=useFood();const navigate=useNavigate();const {pathname}=useLocation();
  const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(0);const input=useRef<HTMLInputElement>(null);
  const results=query.trim()?dataset.foods.filter(f=>f.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0,8):[];
  // Inside the galaxy a search result is located on the map instead of leaving the page.
  const inGalaxy=pathname==='/galaxy';
  function choose(id:string){navigate(inGalaxy?path('/galaxy',{focus:id}):path('/atlas',{food:id}));setOpen(false);setQuery('');input.current?.blur();}
  useEffect(()=>{const slash=(event:KeyboardEvent)=>{if(event.key==='/'&&!typing(event.target)&&!document.querySelector('dialog[open]')){event.preventDefault();input.current?.focus();}};window.addEventListener('keydown',slash);return()=>window.removeEventListener('keydown',slash);},[]);
  const expanded=open&&!!query.trim();
  return <div className="global-search" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}><label><Icon name="search" size={17}/><input ref={input} aria-label="全局搜索餐品" placeholder={inGalaxy?'搜索并在星图中定位':'搜索餐品，直达档案'} value={query} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls="global-food-results" aria-activedescendant={expanded&&results[active]?`global-result-${active}`:undefined} onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(0);}} onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);setQuery('');}
    if(e.key==='ArrowDown'&&results.length){e.preventDefault();setActive(i=>(i+1)%results.length);}
    if(e.key==='ArrowUp'&&results.length){e.preventDefault();setActive(i=>(i-1+results.length)%results.length);}
    if(e.key==='Enter'&&results[active])choose(results[active].id);
  }}/><kbd aria-hidden="true">/</kbd></label>{expanded&&<div id="global-food-results" className="global-suggestions" role="listbox" aria-label="搜索建议" onMouseDown={event=>event.preventDefault()}><div className="suggestion-heading">{results.length?inGalaxy?'↑↓ 选择，回车在星图中定位':'↑↓ 选择，回车打开星球档案':'没有匹配的餐品，换个关键词试试'}</div>{results.map((f,i)=><button key={f.id} id={`global-result-${i}`} role="option" aria-selected={i===active} className={i===active?'is-active':''} onMouseEnter={()=>setActive(i)} onClick={()=>choose(f.id)}><span className="category-dot" style={{background:palette[f.category]}}/>{f.name}<small>{formatNutrient(f,'kcal')}</small></button>)}<button className="close-suggestions" onClick={()=>setOpen(false)}>收起搜索建议</button></div>}</div>;
}
function AppShell(){
  const {dataset,state,notice,storageWarning,path}=useFood();const [sourceOpen,setSourceOpen]=useState(false);const location=useLocation();const navigate=useNavigate();
  const official=dataset.meta.mode==='official-snapshot';
  const fetched=dataset.meta.fetchedAt?new Date(dataset.meta.fetchedAt).toLocaleString('zh-CN',{hour12:false}):'显式演示模式';
  useEffect(()=>{document.documentElement.dataset.route=location.pathname.slice(1)||'home';return()=>{delete document.documentElement.dataset.route;};},[location.pathname]);
  useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});const page=navigation.find(([href])=>href===location.pathname);document.title=`${page?.[1]??'迷路了'} · McCosmos 麦门星图`;},[location.pathname]);
  return <>
    <header className="site-header upgrade-header"><Link className="brand" to={path('/')} aria-label="McCosmos 麦门星图首页"><McBrandMark decorative/><div><strong>McCosmos<span>麦门星图</span></strong><small>麦门星图 / A LITTLE McUNIVERSE</small></div></Link><nav aria-label="主导航">{navigation.map(([href,title],i)=><NavLink key={href} aria-label={title} end={href==='/'} to={path(href)} className={({isActive})=>isActive?'nav-current':''}><small>0{i+1}</small>{title}{href==='/lab'&&state.labSelectedIds.length>0&&<b>{state.labSelectedIds.length}</b>}</NavLink>)}</nav>
      <div className="header-tools"><GlobalSearch/><button className={`global-source ${official?'':'is-demo'}`} onClick={()=>setSourceOpen(true)} aria-label="查看全局数据来源" title={`${fetched} · v${dataset.meta.schemaVersion}`}><i/><strong>{official?'官方营养快照':'合成示例数据 · 非官方营养信息'}</strong><span>{fetched} · v{dataset.meta.schemaVersion}</span><Icon name="info" size={15}/></button></div></header>
    <PageBoundary key={location.pathname}><Suspense fallback={<main className="load-state paper" role="status">正在打开探索站…</main>}><Routes><Route path="/" element={<ObservatoryPage/>}/><Route path="/galaxy" element={<GalaxyPage/>}/><Route path="/atlas" element={<AtlasPage/>}/><Route path="/lab" element={<LabPage/>}/><Route path="/quests" element={<QuestsPage/>}/><Route path="*" element={<main className="empty-state paper"><h1>这条航道还没有记录</h1><p>从观测站重新出发，或搜索一颗餐品星球。</p><Link className="button primary" to={path('/')}>返回宇宙观测站</Link></main>}/></Routes></Suspense></PageBoundary>
    <div className="live-feedback" role="status" aria-live="polite">{notice}</div>{storageWarning&&<p className="storage-warning" role="status">{storageWarning}</p>}
    <footer className="site-footer"><span><McBrandMark decorative/> 好奇心，是最好的宇宙飞船。</span><p>独立参赛作品 · 营养信息以官方渠道为准。收藏、实验台和任务仅存于当前浏览器，清除数据后消失。</p><a href="https://github.com/ayingQAQ/McCosmos" target="_blank" rel="noreferrer">项目手记 ↗</a><small className="release-version">版本 {import.meta.env.VITE_RELEASE ?? 'local'}</small></footer>
    {sourceOpen&&<Modal title="数据来源与探索边界" onClose={()=>setSourceOpen(false)}><div className="about-content"><h3>{official?'官方营养快照':'合成示例数据 · 非官方营养信息'}</h3><p>{dataset.meta.source}</p><p>获取时间：{dataset.meta.fetchedAt??'不适用（合成示例）'}<br/>原始 {dataset.meta.rawCount} 条 · 当前 {dataset.foods.length} 条 · 数据结构 v{dataset.meta.schemaVersion} · 算法 v{dataset.meta.algorithmVersion}</p><p>类别由餐品名称本地推断；官方接口没有明确部分单位和计量基准，所以保留原始值，不声称每份或每 100 克。相近度和航线是数据模型下的探索，不是健康评分、进食或医疗建议。</p><ul>{dataset.warnings.map(w=><li key={w}>{w}</li>)}</ul><p>原创餐品插画为通用示意，非商品配方或官方包装复刻。浏览器只读取公开快照，不访问 Token。</p><button className="button primary" onClick={()=>{navigate(`${location.pathname}${official?'?demo=1':''}`);setSourceOpen(false);}}>{official?'切换到合成演示':'读取官方快照'}</button></div></Modal>}
  </>;
}
export default function App(){return <BrowserRouter><div className="app"><PageBoundary><RepositoryBoundary>{()=> <AppShell/>}</RepositoryBoundary></PageBoundary></div></BrowserRouter>;}
