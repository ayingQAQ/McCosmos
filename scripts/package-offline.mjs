import { copyFile, mkdir, writeFile } from 'node:fs/promises';
await copyFile('scripts/offline-server.mjs', 'dist/serve.mjs');
await mkdir('dist/licenses', { recursive: true });
for (const name of ['nunito', 'zcool-kuaile']) await copyFile(`node_modules/@fontsource/${name}/LICENSE`, `dist/licenses/${name}.txt`);
for (const name of ['roughjs', 'd3-force', 'react', 'react-dom', 'zod']) await copyFile(`node_modules/${name}/LICENSE`, `dist/licenses/${name}.txt`);
await copyFile('node_modules/react-router/LICENSE.md', 'dist/licenses/react-router.txt');
await copyFile('THIRD_PARTY_NOTICES.md', 'dist/licenses/THIRD_PARTY_NOTICES.md');
await writeFile('dist/START-HERE.txt', 'McCosmos 离线静态包\n需要 Node.js 24 或更高版本。\n在本目录运行：node serve.mjs\n浏览器打开 http://127.0.0.1:4173\n无需安装任何依赖，无需联网，无需 Token。\n不要双击 index.html；浏览器会限制本地数据读取。\n');

await writeFile('dist/release.json', JSON.stringify({ commit: process.env.GITHUB_SHA ?? null, builtAt: new Date().toISOString() }) + '\n');
