import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const base='http://127.0.0.1:4173';
await mkdir('artifacts/verification',{recursive:true});
const server=spawn(process.execPath,['serve.mjs'],{cwd:'dist',stdio:'inherit'});
let browser;
const evidence={screens:[],checks:[],errors:[],requests:[]};
try {
  for(let i=0;i<80;i++) {
    try {if((await fetch(base)).ok)break;}catch{/* Server may still be starting. */}
    if(i===79)throw new Error('Static server did not start');
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',error=>evidence.errors.push(error.message));
  page.on('request',request=>{if(request.url().endsWith('.js'))evidence.requests.push(request.url());});
  const visible=async locator=>{await locator.waitFor({state:'visible',timeout:30000});};
  const shot=async name=>{await page.screenshot({path:`artifacts/verification/${name}.png`,fullPage:true});evidence.screens.push(name);};
  await page.goto(base);
  await visible(page.getByRole('heading',{name:'宇宙观测站',exact:true}));
  await visible(page.getByRole('link',{name:'下载 McCosmos Skill ↗'}));
  assert(!evidence.requests.some(url=>/\/(scene|GalaxyPage|AtlasPage|LabPage|QuestsPage)-/.test(url)),'Other routes must not load on the home page');
  evidence.checks.push('home Skill entry and route splitting');
  await shot('home-desktop');
  await page.getByRole('link',{name:'星球图鉴',exact:true}).click();
  await page.getByRole('searchbox',{name:'图鉴搜索'}).fill('冰牛奶');
  await visible(page.getByRole('button',{name:'查看 冰牛奶',exact:true}));
  assert.equal(await page.locator('.food-card').count(),1);
  await page.getByRole('button',{name:'查看 冰牛奶',exact:true}).click();
  await visible(page.getByRole('heading',{name:'冰牛奶中杯',exact:true}));
  await page.getByRole('group',{name:'杯型选择'}).getByRole('button',{name:'小杯',exact:true}).click();
  await visible(page.getByRole('heading',{name:'冰牛奶小杯',exact:true}));
  assert.match(await page.locator('.nutrition-values').innerText(),/147 kcal/);
  await page.getByRole('button',{name:'收藏星球',exact:true}).click();
  await visible(page.getByRole('button',{name:'取消收藏星球',exact:true}));
  await page.locator('.detail-cross-actions').getByRole('button',{name:'加入实验室',exact:true}).click();
  await page.getByRole('link',{name:'营养实验室',exact:true}).click();
  await visible(page.getByRole('heading',{name:'冰牛奶小杯',exact:true}));
  await page.getByRole('searchbox',{name:'实验室搜索'}).fill('麦香鱼');
  await page.getByRole('button',{name:'添加 麦香鱼',exact:true}).click();
  await visible(page.getByRole('heading',{name:'营养观察记录',exact:true}));
  evidence.checks.push('grouped cups, correct nutrition, favorite, lab comparison');
  await shot('lab-desktop');
  await page.getByRole('link',{name:'营养星系',exact:true}).click();
  await page.waitForFunction(()=>!!document.querySelector('.galaxy-canvas')&&!document.querySelector('.webgl-loading'),null,{timeout:30000});
  assert.equal(await page.locator('.webgl-error').count(),0);
  assert.equal(await page.locator('canvas').getAttribute('data-planets'),null,'Production must not emit full diagnostic snapshots');
  await page.getByRole('combobox',{name:'全局搜索餐品'}).fill('巨无霸');
  await page.getByRole('combobox',{name:'全局搜索餐品'}).press('Enter');
  await visible(page.getByRole('heading',{name:'巨无霸',exact:true}));
  evidence.checks.push('production WebGL, search focus, diagnostics disabled');
  await shot('galaxy-desktop');
  for(const [width,height] of [[390,700],[375,568],[812,375]]) {
    await page.setViewportSize({width,height});
    const detail=page.locator('.planet-details');
    await visible(page.getByRole('button',{name:'展开餐品档案'}));
    await page.getByRole('button',{name:'展开餐品档案'}).click();
    await visible(page.getByRole('button',{name:'收起档案，继续探索'}));
    const box=await detail.boundingBox();
    assert(box&&box.height>=100&&box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height,`Readable mobile sheet at ${width}x${height}`);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
    const photo=await detail.locator('.food-photo img').boundingBox();
    assert(photo&&photo.height>=60,'Photo must retain a readable image area beside the mobile summary');
    const canvasBox=await page.locator('.galaxy-canvas').boundingBox();
    assert(box.y-canvasBox.y>=canvasBox.height*.25,'Expanded sheet must retain visible space for the focused planet');
    await shot(`galaxy-${width}x${height}`);
    await page.getByRole('button',{name:'收起档案，继续探索'}).click();
  }
  await page.setViewportSize({width:390,height:700});
  await page.getByRole('button',{name:'关闭星球档案',exact:true}).click();
  const legend=await page.locator('.map-top').boundingBox(), controls=await page.locator('.scene-controls').boundingBox();
  assert(legend.y+legend.height<=controls.y,'Mobile legend and camera controls must not overlap');
  const sourceButton=page.getByRole('button',{name:'查看数据来源',exact:true});
  await sourceButton.click();
  await visible(page.getByRole('dialog'));
  await page.getByRole('button',{name:'关闭窗口',exact:true}).click();
  await shot('galaxy-mobile-overview');
  evidence.checks.push('expandable sheet: phone, short phone, landscape; unobstructed source button');
  // Missing route chunks must offer recovery instead of a blank page.
  const recovery=await context.newPage();
  await recovery.route('**/AtlasPage-*.js',route=>route.abort());
  await recovery.goto(`${base}/atlas`);
  await visible(recovery.getByRole('button',{name:'重新加载',exact:true}));
  await recovery.close();
  evidence.checks.push('lazy route download recovery');
  const release=JSON.parse(await readFile('dist/release.json','utf8'));
  assert.equal(release.commit,process.env.GITHUB_SHA);
  assert.deepEqual(evidence.errors,[]);
  console.log(`Web verification passed: ${evidence.checks.length} flows.`);
} finally {
  await writeFile('artifacts/verification/web.json',JSON.stringify(evidence,null,2));
  await browser?.close();server.kill();
}
