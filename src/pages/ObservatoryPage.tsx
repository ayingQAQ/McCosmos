import { McBrandTab, McDeliverySatellite } from '../components/McBrand';
import { Link, useNavigate } from 'react-router';
import { useFood } from '../state/FoodProvider';
import { FoodIllustration, resolveFoodIllustration } from '../components/food-illustrations';

function ObservatoryArt(){
  const {dataset,path}=useFood();
  const foods=[dataset.foods.find(f=>f.category==='burger'),dataset.foods.find(f=>f.category==='side'),dataset.foods.find(f=>f.category==='dessert')].filter(f=>!!f);
  return <div className="observatory-art" aria-label="连通星系、图鉴和实验室的小航道"><svg viewBox="0 0 530 350" className="observatory-orbits" aria-hidden="true"><path d="M110 65C-50 180 190 385 270 235S550 100 420 60 345 285 145 185"/></svg><McDeliverySatellite/>{foods.map((food,i)=><Link key={food.id} className={`observatory-planet planet-${i}`} to={path(i===0?'/galaxy':i===1?'/atlas':'/lab',i<2?{[i===0?'focus':'food']:food.id}:{})}><FoodIllustration foodId={resolveFoodIllustration(food).presetId} size={120} cosmic decorative/><span>{['去星系漫游','翻开餐品图鉴','做一次营养实验'][i]} ↗</span></Link>)}<span className="orbit-note">YOUR POCKET FOOD UNIVERSE</span></div>;
}
export default function ObservatoryPage(){
  const {dataset,graph,state,foodById,quests,path,setQuestStatus,nextDiscovery}=useFood();const navigate=useNavigate();
  const categories=new Set(dataset.foods.map(f=>f.category)).size;
  function surprise(){const id=nextDiscovery();if(id)navigate(path('/galaxy',{focus:id}));}
  return <main className="observatory-page">
    <section className="observatory-cover"><div className="cover-copy"><McBrandTab/><p className="eyebrow">01 / THE LITTLE OBSERVATORY</p><h1>宇宙观测站</h1><p className="cover-title">把日常的一口，<br/>装进小小宇宙。</p><p className="cover-description">这里有 {dataset.foods.length} 颗带着营养数字的餐品星球。<br/>翻翻图鉴，找找伙伴，让今天多一点小发现。</p><div className="cover-actions"><Link className="button primary" to={path('/galaxy',{guide:'1'})}>开始探索 <span aria-hidden="true">↗</span></Link><button className="button" onClick={surprise}>随机发现一颗星球</button></div><p className="cover-footnote">真实快照 · 可解释连接 · 原创食物贴纸</p></div><ObservatoryArt/></section>
    <section className="observatory-numbers" aria-label="今日宇宙数字">{[[dataset.foods.length,'餐品星球'],[categories,'片推断星系'],[graph.edges.length,'条真实计算关系'],[state.favoriteIds.length,'颗已收藏']].map(([count,label])=><div key={label}><strong>{count}</strong><span>{label}</span></div>)}</section>
    <section className="page-section skill-intro paper" aria-labelledby="skill-intro-title">
      <div><p className="eyebrow">McCOSMOS SKILL</p><h2 id="skill-intro-title">问一句，让餐品自己说数字。</h2><p>在支持 Skill 的 AI 助手中比较餐品、按条件找替代，再来星图看看它们。独立包自带营养快照，离线分析无需 Token。</p><div className="skill-actions"><a className="button primary" href="https://github.com/ayingQAQ/McCosmos/releases/download/skill-v1.0.0/mccosmos-skill.zip">下载 McCosmos Skill ↗</a><a className="text-link" href="https://github.com/ayingQAQ/McCosmos#安装-skill开始一次餐品比较" target="_blank" rel="noreferrer">安装与使用说明 ↗</a></div></div>
      <div><p className="skill-example">使用 $mccosmos，对比巨无霸和麦香鱼的营养差异。</p><p className="skill-example">找比巨无霸热量低、营养轮廓相近的同类餐品。</p><small>需要 Node.js 24+。按具体杯型和规格比较；相似度不是健康评分。查询最新数据时，由助手调用已连接的麦当劳 MCP。</small><p className="snapshot-freshness">{dataset.meta.mode==='official-snapshot'?`网页快照获取于 ${dataset.meta.fetchedAt?.slice(0,10) ?? '未知时间'}，并非实时在售菜单。`:'当前为合成演示数据，非官方营养信息。'}</p></div>
    </section>
    <section className="page-section today-section"><div className="section-title"><div><p className="eyebrow">A SMALL MISSION FOR TODAY</p><h2>今天，从一个小任务开始</h2></div><Link to={path('/quests')}>打开探索手帐 ↗</Link></div><div className="today-missions">{quests.map((quest,i)=><article key={quest.id} className={`mission-preview mission-${i}`}><div className="mission-heading"><span className="mission-number">0{i+1}</span><h3>{quest.title}</h3></div><p>{quest.available?quest.description:'当前数据不足，暂时无法生成这项任务。'}</p><Link className="text-link" to={path('/quests',{quest:quest.id})} onClick={()=>{if(quest.available&&!state.questProgress[quest.id])setQuestStatus(quest.id,'started');}}>{state.questProgress[quest.id]==='claimed'?'星章已收好':quest.available?'开始这个发现 ↗':'查看任务条件 ↗'}</Link></article>)}</div></section>
    <section className="page-section recent-section"><div className="section-title"><div><p className="eyebrow">YOUR RECENT FIELD NOTES</p><h2>最近看过的星球</h2></div><Link to={path('/atlas',{category:'favorites'})}>我的收藏册 · {state.favoriteIds.length} ↗</Link></div>{state.recentlyViewed.length?<div className="recent-foods">{state.recentlyViewed.slice(0,3).map(id=>{const food=foodById.get(id);return food&&<Link key={id} className="recent-food paper" to={path('/atlas',{food:id})}><FoodIllustration foodId={resolveFoodIllustration(food).presetId} size={96} decorative/><div><strong>{food.name}</strong><small>继续读它的星球档案 ↗</small></div></Link>;})}</div>:<div className="recent-empty"><p>手帐的第一页还空着。选一颗星球，就会留下你的足迹。</p><Link className="text-link" to={path('/atlas')}>翻开星球图鉴 ↗</Link></div>}</section>
  </main>;
}
