import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { datasetSchema } from '../src/data/schema';

for (const path of ['README.md', 'MCP_INTEGRATION.md', 'CONTEST_DECLARATION.md', 'skills/mccosmos/SKILL.md', '.env.example', 'mcp-config.example.json', 'dist/index.html', 'dist/serve.mjs']) await readFile(path);
const original = await readFile('CONTEST_DECLARATION.md');
const hash = createHash('sha1').update(`blob ${original.length}\0`).update(original).digest('hex');
const declarationBlobSha = '136e76f3160317049f19f5ba03f4d0fedd70fc3c';
if (hash !== declarationBlobSha) throw new Error('官方参赛声明内容发生变化');
const dataset = datasetSchema.parse(JSON.parse(await readFile('public/data/nutrition.snapshot.json', 'utf8')));
if (dataset.meta.mode !== 'official-snapshot' || dataset.foods.length === 0) throw new Error('缺少有效的官方快照');
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n');
if (tracked.some(path => /(^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith('.env.example'))) throw new Error('仓库跟踪了私密环境文件');
for (const name of await readdir('dist/assets')) {
  if (!name.endsWith('.js')) continue;
  const code = await readFile(`dist/assets/${name}`, 'utf8');
  if (/MCD_MCP_TOKEN|StreamableHTTPClientTransport|Authorization:\s*["']Bearer/.test(code)) throw new Error('浏览器产物混入了服务端 MCP 代码');
}
const skill = await readFile('skills/mccosmos/SKILL.md', 'utf8');
if (!/^---\r?\nname: mccosmos\r?\ndescription: .+\r?\n---/.test(skill)) throw new Error('Skill 缺少有效 frontmatter');
for (const path of ['dist-skill/mccosmos/SKILL.md', 'dist-skill/mccosmos/scripts/mccosmos.mjs', 'dist-skill/mccosmos/assets/nutrition.snapshot.json', 'dist-skill/mccosmos/references/commands.md', 'artifacts/skill/acceptance.json']) await readFile(path);
const acceptance = JSON.parse(await readFile('artifacts/skill/acceptance.json', 'utf8'));
if (acceptance.kind !== 'deterministic-command-acceptance' || acceptance.cases.length < 7) throw new Error('缺少独立 Skill 包的实际命令验收证据');
console.log(`参赛文件、声明原文、来源模型与浏览器隔离检查通过；${dataset.foods.length} 款官方快照餐品。`);
