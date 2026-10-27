import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Dataset, FoodCategory, NutrientKey, NutritionGraph, SimilarityEdge } from '../data/schema';
import { stableHash } from '../data/schema';
import { clusterVolumes, type PlanetPosition } from '../graph/layout';
import { quantile } from '../graph/analysis';
import { relationEdges } from '../graph/view';
import { createPlanetMaterials, makeLabelTexture } from './materials';
import { resolveFoodIllustration } from '../components/food-illustrations/registry';
import { loadFoodArt } from './imageCache';
import { createPlanetBatches } from './batches';

export interface GalaxySceneInput {
  dataset:Dataset; graph:NutritionGraph; positions:PlanetPosition[]; visible:Set<string>;
  lens:NutrientKey; selected:string|null; route:string[]; routeStep:number; showRelations:boolean;
  expanded:boolean;showLabels:boolean;highlight:SimilarityEdge|null;category?:FoodCategory|'all';categoryFocusKey?:number;
  onSelect:(id:string|null)=>void;onRelationSelect?:(edge:SimilarityEdge)=>void;
  insets?:()=>{left:number;bottom:number};
}
export interface PlanetHover {id:string;name:string;x:number;y:number}
interface Pose {position:THREE.Vector3;target:THREE.Vector3}
interface Planet {id:string;group:THREE.Group;body:THREE.Mesh;outline:THREE.Mesh;illustration:THREE.Mesh;ring?:THREE.Mesh;label?:THREE.Sprite;radius:number;targetRadius:number}
export interface SceneController {sync:()=>void;home:()=>void;overview:()=>void;restore:()=>void;dolly:(factor:number)=>void;category:(category:FoodCategory)=>void;dispose:()=>void}

export function createGalaxyScene(canvas:HTMLCanvasElement,read:()=>GalaxySceneInput,labels:Map<FoodCategory,HTMLButtonElement>,report:(zoom:number,focused:boolean,hovered:PlanetHover|null)=>void,onError:(message:string)=>void):SceneController {
  const initial=read(),renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  const diagnostics=import.meta.env.DEV||new URLSearchParams(location.search).get('diagnostics')==='1';
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor('#FFF8EB');
  const scene=new THREE.Scene();scene.background=new THREE.Color('#FFF8EB');scene.fog=new THREE.Fog('#F3E9D8',2500,9500);
  const camera=new THREE.PerspectiveCamera(55,1,2,30000);
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.075;controls.rotateSpeed=.55;controls.zoomSpeed=.6;controls.zoomToCursor=true;controls.panSpeed=.65;controls.listenToKeyEvents(canvas);
  controls.minDistance=45;controls.maxDistance=18000;controls.maxPolarAngle=Math.PI*.93;controls.minPolarAngle=Math.PI*.07;controls.maxTargetRadius=8500;
  controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
  controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const home:Pose={position:new THREE.Vector3(-260,330,1120),target:new THREE.Vector3(-600,50,150)};
  const copy=(pose:Pose):Pose=>({position:pose.position.clone(),target:pose.target.clone()});
  const pose=():Pose=>({position:camera.position.clone(),target:controls.target.clone()});
  const initialBounds=canvas.getBoundingClientRect();
  let width=initialBounds.width||1000,height=initialBounds.height||800,frame=0,dirty=true,disposed=false,drawing=false,hover:string|null=null,saved:Pose|null=null;
  function requestDraw(){if(!frame&&!drawing&&!disposed&&!document.hidden)frame=requestAnimationFrame(draw);}
  function invalidate(){dirty=true;requestDraw();}
  camera.aspect=width/height;camera.updateProjectionMatrix();
  let flight:{start:number;duration:number;from:Pose;to:Pose}|null=null;
  let viewInitialized=false,viewX=0,viewY=0,targetViewX=0,targetViewY=0;
  let previousSelected:string|null=null,previousLens:NutrientKey|null=null,previousCategory:FoodCategory|'all'|undefined,previousRoute='',previousEdges='';
  let previousCategoryFocusKey:number|undefined;
  let down:{x:number;y:number;pointer:number;moved:boolean;threshold:number}|null=null;
  const pointers=new Set<number>();
  let pendingPointer:{x:number;y:number;type:string}|null=null;
  const scratch=new THREE.Vector3(),projected=new THREE.Vector3();
  const foodById=new Map(initial.dataset.foods.map(food=>[food.id,food]));
  type ScreenRect={x:number;y:number;width:number;height:number};
  let blockers:ScreenRect[]=[];
  function stopInertia(){controls.enableDamping=false;controls.update();controls.enableDamping=!reduced.matches;}
  function apply(next:Pose){stopInertia();camera.position.copy(next.position);controls.target.copy(next.target);controls.update();invalidate();}
  apply(home);
  scene.add(new THREE.HemisphereLight('#FFF6DF','#857E91',.9));
  const sun=new THREE.DirectionalLight('#FFF4D4',1.4);sun.position.set(-500,1000,1400);scene.add(sun);
  const fill=new THREE.DirectionalLight('#C4DEF2',.3);fill.position.set(900,-200,-500);scene.add(fill);
  const art=createPlanetMaterials();
  const sphere=new THREE.SphereGeometry(1,24,16),vertices=sphere.getAttribute('position');
  for(let i=0;i<vertices.count;i++){const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i),bend=1+.013*Math.sin(x*7+y*4)*Math.cos(z*6);vertices.setXYZ(i,x*bend,y*bend,z*bend);}
  sphere.computeVertexNormals();
  const ringGeometry=new THREE.TorusGeometry(1.45,.045,5,48);
  // A shared curved patch follows the actual sphere surface instead of a flat billboard.
  const foodSurface=new THREE.PlaneGeometry(1.4,1.4,16,16),surfaceVertices=foodSurface.getAttribute('position');
  for(let i=0;i<surfaceVertices.count;i++){
    const x=surfaceVertices.getX(i),y=surfaceVertices.getY(i);
    surfaceVertices.setZ(i,Math.sqrt(1.028*1.028-x*x-y*y));
  }
  foodSurface.computeVertexNormals();
  const planets:Planet[]=[],byId=new Map<string,Planet>(),bodies:THREE.Mesh[]=[];
  const positionById=new Map(initial.positions.map(p=>[p.id,p]));
  const labelTextures=new Set<THREE.Texture>(),labelMaterials=new Set<THREE.SpriteMaterial>();
  const foodTextures=new Map<string,THREE.Texture>(),foodMaterials=new Map<string,THREE.MeshToonMaterial>();
    let loadedArt=0,failedArt=0;
  function foodMaterial(presetId:string){
    const existing=foodMaterials.get(presetId);if(existing)return existing;
    const texture=new THREE.Texture();
    loadFoodArt(presetId).then(image=>{
      if(disposed)return;texture.image=image;texture.needsUpdate=true;loadedArt++;invalidate();
    }).catch(()=>{
      if(disposed)return;failedArt++;invalidate();onError('餐品插画载入失败，请重新载入；餐品目录仍可使用。');
    });
    texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    const material=new THREE.MeshToonMaterial({map:texture,gradientMap:art.materials.burger.gradientMap,transparent:true,alphaTest:.08,depthTest:true,depthWrite:true,fog:true});
    foodTextures.set(presetId,texture);foodMaterials.set(presetId,material);return material;
  }
  for(const food of initial.dataset.foods){
    const point=positionById.get(food.id)!;if(!point)continue;
    const group=new THREE.Group();group.position.set(point.x,point.y,point.z);
    const body=new THREE.Mesh(sphere,art.materials[food.category]),outline=new THREE.Mesh(sphere,art.outline);
    const presetId=resolveFoodIllustration(food).presetId;
    const illustration=new THREE.Mesh(foodSurface,foodMaterial(presetId));illustration.userData.presetId=presetId;group.add(illustration);
    body.userData.foodId=food.id;group.add(outline,body);bodies.push(body);
    const planet:Planet={id:food.id,group,body,outline,illustration,radius:30,targetRadius:30};
    if(food.category==='dessert'||stableHash(food.id)%5===0){const ring=new THREE.Mesh(ringGeometry,art.ring);ring.rotation.set(1.15,.22,(stableHash(food.id)%10)*.06);group.add(ring);planet.ring=ring;}
    planets.push(planet);byId.set(food.id,planet);scene.add(group);
  }
  const batches=createPlanetBatches(scene,planets.flatMap(planet=>[planet.body,planet.outline,planet.illustration,...(planet.ring?[planet.ring]:[])]));
  const clouds=clusterVolumes(initial.positions);
  // A single batched 3D point cloud, with deterministic XYZ positions, recedes behind the food.
  const starGeometry=new THREE.BufferGeometry(),starPositions:number[]=[],starColors:number[]=[];
  for(let i=0;i<1300;i++){
    const a=(stableHash(`a:${i}`)%10000)/10000*Math.PI*2,z=(stableHash(`b:${i}`)%10000)/5000-1,r=4200+(stableHash(`r:${i}`)%8500),flat=Math.sqrt(1-z*z);
    starPositions.push(Math.cos(a)*flat*r,z*r,Math.sin(a)*flat*r);
    const color=new THREE.Color(i%9===0?'#C79143':i%3===0?'#8FB5B5':'#B7A58D');starColors.push(color.r,color.g,color.b);
  }
  starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));starGeometry.setAttribute('color',new THREE.Float32BufferAttribute(starColors,3));
  const starCanvas=document.createElement('canvas');starCanvas.width=32;starCanvas.height=32;
  const starCtx=starCanvas.getContext('2d')!;starCtx.fillStyle='white';starCtx.beginPath();starCtx.arc(16,16,12,0,Math.PI*2);starCtx.fill();
  const starTexture=new THREE.CanvasTexture(starCanvas);
  const starMaterial=new THREE.PointsMaterial({size:24,map:starTexture,vertexColors:true,transparent:true,opacity:.7,depthWrite:false,fog:false,sizeAttenuation:true});
  const stars=new THREE.Points(starGeometry,starMaterial);scene.add(stars);
  const lines=new THREE.Group();scene.add(lines);
  const edgeObjects:{edge:SimilarityEdge;line:THREE.Line;points:THREE.Vector3[]}[]=[];
  const raycaster=new THREE.Raycaster();raycaster.params.Line={threshold:12};
  const ndc=new THREE.Vector2();

  function fly(next:Pose){
    stopInertia();
    if(reduced.matches){flight=null;apply(next);}else flight={start:performance.now(),duration:Math.min(800,400+camera.position.distanceTo(next.position)*.12),from:pose(),to:copy(next)};
    invalidate();
  }
  function focusFood(planet:Planet){
    const direction=camera.position.clone().sub(controls.target).normalize(),target=planet.group.position.clone();
    const distance=width<600?Math.max(380,planet.targetRadius*12):Math.max(240,planet.targetRadius*7);
    fly({target,position:target.clone().addScaledVector(direction,distance)});
  }
  function framePoints(points:THREE.Vector3[],padding=150){
    if(!points.length)return;
    const box=new THREE.Box3().setFromPoints(points),center=box.getCenter(new THREE.Vector3()),extent=box.getSize(new THREE.Vector3()).length()/2+padding;
    const direction=camera.position.clone().sub(controls.target).normalize();
    const angle=Math.min(THREE.MathUtils.degToRad(camera.fov/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
    const distance=Math.max(220,extent/Math.sin(angle));
    fly({target:center,position:center.clone().addScaledVector(direction,distance)});
  }
  function focusCategory(category:FoodCategory){
    const cloud=clouds.find(cloud=>cloud.category===category);if(!cloud)return;
    const target=new THREE.Vector3(cloud.x,cloud.y,cloud.z),direction=camera.position.clone().sub(controls.target).normalize();
    // Enter the cloud instead of shrinking every member into a remote overview.
    const distance=Math.max(550,cloud.radius*(width<600?1.6:1.35));
    fly({target,position:target.clone().addScaledVector(direction,distance)});
  }
  function restore(){if(saved){const previous=saved;saved=null;fly(previous);}read().onSelect(null);invalidate();}
  function updateView(immediate=false){
    const p=read(),inset=p.insets?.()??{left:0,bottom:0};
    const detail=canvas.parentElement?.querySelector<HTMLElement>('.planet-details');
    const detailBounds=detail?.getBoundingClientRect(),canvasBounds=canvas.getBoundingClientRect();
    const left=width>850?Math.min(inset.left,width*.45):0,right=width>850&&detailBounds?Math.min(width*.45,canvasBounds.right-detailBounds.left):0;
    const centerX=left+(width-left-right)/2;
    const availableHeight=width<=850&&detailBounds?Math.max(80,detailBounds.top-canvasBounds.top):height-Math.min(inset.bottom,height*.25);
    const centerY=availableHeight/2;
    targetViewX=width/2-centerX;targetViewY=height/2-centerY;
    if(!viewInitialized||immediate||reduced.matches){viewX=targetViewX;viewY=targetViewY;viewInitialized=true;}
    camera.aspect=width/height;camera.setViewOffset(width,height,viewX,viewY,width,height);camera.updateProjectionMatrix();
    // Panels only change at sync/resize, not every camera frame. Avoid forced layout while orbiting.
    const canvasBox=canvas.getBoundingClientRect();
    blockers=Array.from(canvas.parentElement?.querySelectorAll<HTMLElement>('.galaxy-panel')??[]).map(element=>{const box=element.getBoundingClientRect();return {x:box.x-canvasBox.x,y:box.y-canvasBox.y,width:box.width,height:box.height};});
    invalidate();
  }
  function clearEdges(){for(const item of edgeObjects){item.line.geometry.dispose();(item.line.material as THREE.Material).dispose();}edgeObjects.length=0;lines.clear();}
  function sync(){
    if(disposed)return;const p=read();
    if(previousLens!==p.lens){
      const values=p.dataset.foods.flatMap(f=>f.nutrition[p.lens]===null?[]:[f.nutrition[p.lens]!]).sort((a,b)=>a-b),lo=quantile(values,.05),hi=quantile(values,.95);
      for(const food of p.dataset.foods){const planet=byId.get(food.id);if(!planet)continue;const value=food.nutrition[p.lens];planet.targetRadius=value===null?16:hi===lo?30:21+20*Math.sqrt(Math.max(0,Math.min(1,(value-lo)/(hi-lo))));}
      previousLens=p.lens;
    }
    for(const planet of planets)planet.group.visible=p.visible.has(planet.id);
    if(previousSelected!==p.selected){
      if(p.selected){
        if(!previousSelected&&!saved)saved=pose();
        const planet=byId.get(p.selected);
        // Router selection may arrive after discovery state. Keep the pair's camera intent.
        if(planet&&!p.highlight)focusFood(planet);
      }else if(saved){const previous=saved;saved=null;fly(previous);}
      previousSelected=p.selected;
    }
    const routeKey=`${p.route.join(':')}:${p.highlight?.source??''}:${p.highlight?.target??''}`;
    if((p.highlight||!p.selected)&&routeKey!==previousRoute){
      if(p.highlight&&!saved)saved=pose();
      const ids=p.highlight?[p.highlight.source,p.highlight.target]:p.route;
      framePoints(ids.flatMap(id=>byId.has(id)?[byId.get(id)!.group.position]:[]),120);
    }
    previousRoute=routeKey;
    if((p.category!==previousCategory||p.categoryFocusKey!==previousCategoryFocusKey)&&p.category&&p.category!=='all'&&!p.selected&&!p.highlight)focusCategory(p.category);
    previousCategory=p.category;
    previousCategoryFocusKey=p.categoryFocusKey;
    const edgeKey=`${p.selected}:${p.showRelations}:${p.expanded}:${p.route.join(':')}:${p.routeStep}:${p.highlight?.source}:${p.highlight?.target}:${[...p.visible].join(',')}`;
    if(edgeKey!==previousEdges){
      clearEdges();
      const displayed=new Set(p.showRelations?relationEdges(p.graph,p.selected,p.expanded,p.visible):[]);
      const pairs=new Set(p.route.slice(1,Math.max(1,p.routeStep+1)).map((id,i)=>[id,p.route[i]].sort().join(':')));
      const all=p.highlight?[...p.graph.edges.filter(e=>[e.source,e.target].sort().join(':')!==[p.highlight!.source,p.highlight!.target].sort().join(':')),p.highlight]:p.graph.edges;
      for(const edge of all){
        const route=pairs.has([edge.source,edge.target].sort().join(':')),highlight=edge===p.highlight;
        if(!(displayed.has(edge)||route||highlight)||!p.visible.has(edge.source)||!p.visible.has(edge.target))continue;
        const a=byId.get(edge.source)!.group.position,b=byId.get(edge.target)!.group.position,control=a.clone().lerp(b,.5).add(new THREE.Vector3(0,80,60));
        const points=new THREE.QuadraticBezierCurve3(a,control,b).getPoints(48),geometry=new THREE.BufferGeometry().setFromPoints(points);
        const material=new THREE.LineDashedMaterial({color:highlight?'#9971B7':route?'#BD7F2D':'#AF9D85',dashSize:15,gapSize:10,transparent:true,opacity:highlight ? .95 : route ? .9 : .32});
        const line=new THREE.Line(geometry,material);line.computeLineDistances();lines.add(line);edgeObjects.push({edge,line,points});
      }
      previousEdges=edgeKey;
    }
    controls.minDistance=p.selected?Math.max(75,(byId.get(p.selected)?.targetRadius??30)*2.7):45;
    updateView();invalidate();
  }
  function hit(clientX:number,clientY:number,pointerType='mouse'){
    const rect=canvas.getBoundingClientRect();ndc.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(ndc,camera);
    const body=raycaster.intersectObjects(bodies.filter(b=>b.parent?.visible),false)[0];
    if(body)return {foodId:body.object.userData.foodId as string};
    // Preserve exact relationship picking before extending tiny food targets.
    const edge=raycaster.intersectObjects(edgeObjects.map(e=>e.line),false)[0];
    if(edge)return {edge:edgeObjects.find(e=>e.line===edge.object)?.edge};
    const px=clientX-rect.left,py=clientY-rect.top,minRadius=pointerType==='touch'?24:14;
    const focal=height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
    let nearest:Planet|undefined,best=Infinity;
    for(const planet of planets){
      if(!planet.group.visible)continue;
      const center=project(planet.group.position);if(center.z<=-1||center.z>=1)continue;
      const local=scratch.copy(planet.group.position).applyMatrix4(camera.matrixWorldInverse),depth=-local.z;
      const radius=depth>planet.radius?focal*planet.radius/Math.sqrt(depth*depth-planet.radius*planet.radius):0;
      const distance=Math.hypot(px-center.x,py-center.y);
      if(distance<=Math.max(radius,minRadius)&&distance<best){nearest=planet;best=distance;}
    }
    return nearest?{foodId:nearest.id}:{};
  }
  const start=()=>{flight=null;hover=null;pendingPointer=null;invalidate();};controls.addEventListener('start',start);
  const change=()=>{invalidate();};controls.addEventListener('change',change);
  const keyboard=(event:KeyboardEvent)=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))start();};
  canvas.addEventListener('keydown',keyboard,{capture:true});
  const pointerDown=(event:PointerEvent)=>{pointers.add(event.pointerId);if(pointers.size===1)down={x:event.clientX,y:event.clientY,pointer:event.pointerId,moved:false,threshold:event.pointerType==='touch'?10:6};else if(down)down.moved=true;};
  const pointerMove=(event:PointerEvent)=>{
    if(down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)>down.threshold)down.moved=true;
    if(!pointers.size){pendingPointer={x:event.clientX,y:event.clientY,type:event.pointerType};invalidate();}
  };
  const pointerEnd=(event:PointerEvent)=>{
    if(event.type==='pointerup'&&event.button===0&&pointers.size===1&&down&&!down.moved){const result=hit(event.clientX,event.clientY,event.pointerType);if(result.edge)read().onRelationSelect?.(result.edge);else if(result.foodId)read().onSelect(result.foodId);}
    pointers.delete(event.pointerId);if(!pointers.size)down=null;else if(down)down.moved=true;
  };
  const leave=()=>{hover=null;pendingPointer=null;invalidate();};
  canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);canvas.addEventListener('pointerleave',leave);
  const lost=(event:Event)=>{event.preventDefault();onError('三维图形上下文已中断，请重新载入星系。餐品目录仍可使用。');};canvas.addEventListener('webglcontextlost',lost);
  function project(point:THREE.Vector3){projected.copy(point).project(camera);return {x:(projected.x+1)*width/2,y:(1-projected.y)*height/2,z:projected.z};}
  let lastReport='',lastSnapshot=-Infinity,snapshotPending=false;
  function publishSnapshot(){
    canvas.dataset.foodTextures=JSON.stringify({loaded:loadedArt,failed:failedArt,total:foodMaterials.size});
    const snapshot=planets.map(planet=>{
      const center=project(planet.group.position),local=scratch.copy(planet.group.position).applyMatrix4(camera.matrixWorldInverse),depth=-local.z,r=planet.radius*1.035;
      // Tangents to a camera-space sphere: conservative projected bounds also work off axis.
      const denominator=Math.max(.001,depth*depth-r*r),focal=height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
      const axisRadius=(axis:number)=>{const tangent=r*Math.sqrt(Math.max(0,axis*axis+depth*depth-r*r));return Math.max(Math.abs((axis*depth-tangent)/denominator-axis/depth),Math.abs((axis*depth+tangent)/denominator-axis/depth))*focal;};
      const radius=depth>r?Math.hypot(axisRadius(local.x),axisRadius(local.y)):Math.max(width,height);
      return {id:planet.id,...center,radius,visible:planet.group.visible&&center.z>-1&&center.z<1&&center.x>-radius&&center.x<width+radius&&center.y>-radius&&center.y<height+radius};
    });
    const windowIds=snapshot.filter(p=>p.visible).map(p=>p.id);
    const rounded=(v:THREE.Vector3)=>v.toArray().map(n=>Number(n.toFixed(6)));
    canvas.dataset.camera=JSON.stringify({position:rounded(camera.position),target:rounded(controls.target),distance:Number(camera.position.distanceTo(controls.target).toFixed(6))});
    canvas.dataset.planets=JSON.stringify(snapshot);canvas.dataset.edges=JSON.stringify(edgeObjects.map(e=>({source:e.edge.source,target:e.edge.target,points:e.points.map(project)})));
    canvas.dataset.rendered=String(windowIds.length);canvas.dataset.window=JSON.stringify(windowIds);canvas.dataset.total=String(read().visible.size);
    canvas.dataset.gpu=JSON.stringify({calls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures});
  }
  function publish(){
    const zoom=Math.round(home.position.distanceTo(home.target)/camera.position.distanceTo(controls.target)*100);
    const hovered=hover&&hover!==read().selected&&byId.get(hover)?.group.visible?byId.get(hover):undefined;
    const hoverPoint=hovered?project(hovered.group.position):undefined;
    const hoverInfo=hovered&&hoverPoint?{id:hovered.id,name:foodById.get(hovered.id)!.name,x:Math.round(Math.max(90,Math.min(width-90,hoverPoint.x))),y:Math.round(Math.max(55,Math.min(height-120,hoverPoint.y)))}:null;
    const key=JSON.stringify({zoom,focused:!!saved,hoverInfo});
    if(key!==lastReport){report(zoom,!!saved,hoverInfo);lastReport=key;}
    const occupied:{x:number;y:number;width:number;height:number}[]=[];
    const overlaps=(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number})=>a.x<b.x+b.width+8&&a.x+a.width+8>b.x&&a.y<b.y+b.height+8&&a.y+a.height+8>b.y;
    for(const cloud of clouds){
      const button=labels.get(cloud.category);if(!button)continue;
      const label=project(new THREE.Vector3(cloud.x,cloud.y+cloud.radius*.8,cloud.z)),state=read();
      button.hidden=!!state.selected||(!!state.category&&state.category!=='all')||!initial.positions.some(point=>point.category===cloud.category&&state.visible.has(point.id))||label.z<-1||label.z>1;
      if(button.hidden)continue;
      const candidates=[[0,0],[0,46],[0,-46],[100,0],[-100,0]].map(([dx,dy])=>({x:label.x+dx-55,y:label.y+dy-20,width:110,height:40}));
      const position=candidates.find(rect=>rect.x>12&&rect.x+rect.width<width-12&&rect.y>65&&rect.y+rect.height<height-100&&[...blockers,...occupied].every(other=>!overlaps(rect,other)));
      button.hidden=!position;
      if(position){occupied.push(position);button.style.transform=`translate(${position.x+55}px,${position.y+20}px) translate(-50%,-50%)`;}
    }
  }
  function draw(){
    frame=0;if(disposed||document.hidden)return;
    drawing=true;
    const p=read();controls.enableDamping=!reduced.matches;
    if(pendingPointer){
      const point=pendingPointer;pendingPointer=null;
      const result=hit(point.x,point.y,point.type);hover=result.foodId??null;
      canvas.style.cursor=hover||result.edge?'pointer':'grab';dirty=true;
    }
    if(flight){const t=Math.min(1,(performance.now()-flight.start)/flight.duration),ease=t*t*(3-2*t);camera.position.lerpVectors(flight.from.position,flight.to.position,ease);controls.target.lerpVectors(flight.from.target,flight.to.target,ease);if(t===1)flight=null;dirty=true;}
    const controlsChanged=controls.update();
    if(viewX!==targetViewX||viewY!==targetViewY){
      viewX=reduced.matches||Math.abs(targetViewX-viewX)<.25?targetViewX:viewX+(targetViewX-viewX)*.18;
      viewY=reduced.matches||Math.abs(targetViewY-viewY)<.25?targetViewY:viewY+(targetViewY-viewY)*.18;
      camera.setViewOffset(width,height,viewX,viewY,width,height);camera.updateProjectionMatrix();dirty=true;
    }
    let resizing=false;
    for(const planet of planets){
      const target=planet.targetRadius*(hover===planet.id?1.09:1),delta=target-planet.radius;
      if(delta!==0){planet.radius=reduced.matches||Math.abs(delta)<.02?target:planet.radius+delta*.16;dirty=true;}
      if(planet.radius!==target)resizing=true;
      // Food art bends with the spherical cap and receives the same world lighting.
      // Keep its readable face towards the viewer without flattening the 3D planet.
      planet.illustration.scale.setScalar(planet.radius);
      planet.illustration.lookAt(camera.position);planet.body.scale.setScalar(planet.radius);planet.outline.scale.setScalar(planet.radius*1.035);planet.ring?.scale.setScalar(planet.radius);
      const show=planet.group.visible&&(p.showLabels||p.selected===planet.id||p.route[p.routeStep]===planet.id);
      if(!show&&planet.label){
        const label=planet.label,material=label.material,texture=material.map;
        planet.group.remove(label);if(texture){texture.dispose();labelTextures.delete(texture);}
        material.dispose();labelMaterials.delete(material);delete planet.label;
      }
      if(show&&!planet.label){const food=foodById.get(planet.id)!;const texture=makeLabelTexture(food.name);labelTextures.add(texture);const material=new THREE.SpriteMaterial({map:texture,depthTest:true,depthWrite:false});labelMaterials.add(material);planet.label=new THREE.Sprite(material);planet.label.scale.set(125,24,1);planet.group.add(planet.label);}
      if(planet.label){planet.label.visible=show;planet.label.position.set(0,-planet.radius-20,0);}
      // Keep the camera outside every visible food sphere while allowing entry into the cloud itself.
      if(planet.group.visible){const delta=scratch.copy(camera.position).sub(planet.group.position),safe=planet.radius+14;if(delta.lengthSq()<safe*safe){camera.position.copy(planet.group.position).add(delta.lengthSq()?delta.setLength(safe):delta.set(0,0,safe));dirty=true;}}
    }
    if(controls.target.lengthSq()>8500*8500){const displacement=scratch.copy(controls.target).setLength(8500).sub(controls.target);controls.target.add(displacement);camera.position.add(displacement);dirty=true;}
    const moving=!!flight||resizing||viewX!==targetViewX||viewY!==targetViewY||controlsChanged&&!reduced.matches;
    if(dirty){
      const distance=camera.position.distanceTo(controls.target);(scene.fog as THREE.Fog).near=Math.max(1200,distance*.8);(scene.fog as THREE.Fog).far=Math.max(6500,distance*2.1);
      camera.updateMatrixWorld();scene.updateMatrixWorld(true);batches.sync(camera);renderer.render(scene,camera);publish();
      // Detailed DOM diagnostics are useful for accessibility/regression tooling, not per-frame work.
      if(diagnostics){snapshotPending=true;
        const now=performance.now();if(!moving||now-lastSnapshot>=120){publishSnapshot();lastSnapshot=now;snapshotPending=false;}}
      dirty=false;
    }
    if(!moving&&snapshotPending){publishSnapshot();lastSnapshot=performance.now();snapshotPending=false;}
    drawing=false;
    if(moving)requestDraw();
  }
  const resize=new ResizeObserver(entries=>{const bounds=entries[0].contentRect;if(!bounds.width||!bounds.height)return;const changed=width!==bounds.width||height!==bounds.height;width=bounds.width;height=bounds.height;renderer.setPixelRatio(Math.min(devicePixelRatio||1,width<600?1.25:1.5));renderer.setSize(width,height,false);updateView(true);const selected=read().selected;if(changed&&selected&&byId.has(selected))focusFood(byId.get(selected)!);});resize.observe(canvas);
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else invalidate();};document.addEventListener('visibilitychange',visibility);
  const motion=()=>{stopInertia();if(reduced.matches&&flight){const target=flight.to;flight=null;apply(target);}invalidate();};reduced.addEventListener('change',motion);
  // Observe actual sheet size so expansion and responsive changes keep focus above it.
  let observedDetail:HTMLElement|null=null;
  const panelResize=new ResizeObserver(()=>updateView());
  const observeDetail=()=>{const detail=canvas.parentElement?.querySelector<HTMLElement>('.planet-details')??null;if(detail===observedDetail)return;panelResize.disconnect();observedDetail=detail;if(detail)panelResize.observe(detail);updateView();};
  const panelChanges=new MutationObserver(observeDetail);
  if(canvas.parentElement)panelChanges.observe(canvas.parentElement,{childList:true});
  observeDetail();
  if(diagnostics)canvas.dataset.world=JSON.stringify(initial.positions.map(({id,x,y,z})=>({id,x,y,z})));
  canvas.style.cursor='grab';sync();requestDraw();
  return {
    sync,
    home(){flight=null;saved=null;apply(home);read().onSelect(null);invalidate();},
    overview(){saved=null;read().onSelect(null);framePoints(initial.positions.map(p=>new THREE.Vector3(p.x,p.y,p.z)),180);},
    restore,
    category(category){saved=null;focusCategory(category);},
    dolly(factor){flight=null;stopInertia();const offset=camera.position.clone().sub(controls.target),distance=THREE.MathUtils.clamp(offset.length()/factor,controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(offset.setLength(distance));controls.update();invalidate();},
    dispose(){
      disposed=true;cancelAnimationFrame(frame);resize.disconnect();panelResize.disconnect();panelChanges.disconnect();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',motion);
      canvas.removeEventListener('keydown',keyboard,{capture:true});canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerEnd);canvas.removeEventListener('pointercancel',pointerEnd);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('webglcontextlost',lost);
      controls.removeEventListener('start',start);controls.removeEventListener('change',change);controls.dispose();clearEdges();batches.dispose();sphere.dispose();ringGeometry.dispose();foodSurface.dispose();art.dispose();foodTextures.forEach(t=>t.dispose());foodMaterials.forEach(m=>m.dispose());foodTextures.clear();foodMaterials.clear();starGeometry.dispose();starMaterial.dispose();starTexture.dispose();labelTextures.forEach(t=>t.dispose());labelMaterials.forEach(m=>m.dispose());scene.clear();renderer.dispose();renderer.forceContextLoss();
    }
  };
}
