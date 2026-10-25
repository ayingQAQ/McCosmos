# 麦当劳 MCP 实际接入

Node 端使用 `@modelcontextprotocol/sdk` 连接 `https://mcp.mcd.cn`（Streamable HTTP），调用 `listTools()` 后调用 `list-nutrition-foods`，参数 `{}`。认证来自 `MCD_MCP_TOKEN`，以 Bearer 请求头发送。浏览器只读取白名单快照，不访问 MCP 或 Token。

## 实际证据与响应

项目 SDK 于 **2026-10-21T03:20:35.542Z** 真实同步成功，返回160条，完全重复项合并后158条。未来以快照 meta 为准。

优先入口是 `structuredContent: {success, code, data}`，data 为 TOON 表格：

```text
[N]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:
  ...
```

严格解码检查字段、行数和转义。仅结构化内容缺失时，读取文本 `## Original Response` 后的 JSON。存在但无效的结构化内容直接失败，不用另一份文本掩盖错误。禁止执行返回文本。

| 接口字段 | 内部字段 | 边界 |
|---|---|---|
| productName | name/originalName | 保留规格文字，类别本地推断 |
| energyKcal | kcal | 字段明确为 kcal，未说明计量基准 |
| protein/fat/carbohydrate | proteinG/fatG/carbsG | 内部名为预期单位，当前仅展示原始值 |
| sodium/calcium | sodiumMg/calciumMg | 单位待核实，不换算 |
| nutritionDescription | 只参与去重 | 不作为份量或医学结论证据 |

当前官方记录 `basis.unitsVerified=false`，不能从内部字段名推导 g/mg，也不声称每份或每100克。异常数值保留 null 并告警，合法零值保留。同名不同数值记录独立保留，完全重复项合并并记录次数。公开快照不保存 traceId、Token、账号或完整原始响应。

## 2.0 多页复用与再次核验

五个页面由 `FoodProvider` 统一读取同一份快照与图分析；图鉴、实验室、任务不建立第二份营养数据。实验室逐指标比较原始值，保留 0/null，单位口径不同时不绘制共同量尺或输出差值；任务从现有数据与真实 BFS 结果生成有解候选。收藏与任务仅存本地，不发送到 MCP。

2026-10-21 升级期间再次只读调用已连接 MCP 的 `list-nutrition-foods`，成功返回 `success=true / code=200`，数据为 `[160]{productName,...}` TOON。该连接核验没有覆盖现有网页快照，也没有触发交易或个人信息接口；网页获取时间仍以已提交快照 meta 为准。

## 复现与失败处理

按[官方指南](https://github.com/M-China/mcd-mcp-server)申请 Token，设置 `MCD_MCP_TOKEN` 或被忽略的 `.env.local`，安装依赖后执行 `pnpm sync:mcd`。成功后原子替换 `public/data/nutrition.snapshot.json`，只输出日期、数量和告警。

单次 HTTP 超时30秒，最多三次尝试，有限退避，Retry-After 等待上限30秒；401不重试。未知格式、网络错误和空数据均不替换旧快照。普通 CI 使用提交的快照进行独立运行检查，不依赖个人 Token。

## 数据价值与算法

五种透镜、星球大小、邻居、BFS航线和发现卡片均由真实数据驱动。对有效值 log1p 后按全快照线性插值 P5/P95 缩放，退化列0.5。权重热量0.30、蛋白质0.25、其余各0.15；共同有效维度至少三项，重归一权重。相近度 `100 * exp(-distance / 0.5)`。

每节点取分数≥50的Top3，取无向边并集，度数可超过三；并列按稳定ID排序。航线为最少跳数，不强行补边。双生星取跨类别且分数≥80的前五对；孤独星球取完整数据中最近邻相似度最低的五个。过滤与透镜不改变计算基准。

网页、CLI、Skill 复用纯 TypeScript 算法，不依赖运行时大模型。这些是工程探索结果，非官方分类、健康评价、当前供应信息或等重量比较。


## Skill 优先工作流（2026-10-24）

Skill 是餐品营养对比、筛选与替代发现的自然语言入口，CLI 为其确定性执行器，网站展示分析对象。新增 search/compare/alternatives 复用原比较函数、全量快照归一化与相似度，保留原始规格，不通过图片或营养值推断配料。

- **快照路径**：独立 Skill 包内 assets/nutrition.snapshot.json → 校验模型与来源 → CLI 分析 → 返回 source/fetchedAt/dataInput/snapshotAgeHours。无需 Token、依赖安装或网页。
- **宿主 MCP 路径**：用户需要最新数据 → 宿主 Agent 实际调用 list-nutrition-foods → 保存该次工具响应及明确获取时间 → CLI --response/--fetched-at → 复用既有 TOON 适配器 → 分析本次数据。CLI 不访问认证信息，不把转换时间伪装成数据获取时间。
- **已有外部快照**：--data 指定模型合规的文件；无效数据直接报错，不回退。数据输入选项互斥，合成数据必须 --demo。

search 对 kcal 上限包含边界，缺失不满足上限；alternatives --lower-kcal 为严格小于，同类默认使用本地推断类别。没有候选是正常结果。相似替代按全量快照统一归一化，不因筛选条件改变基准；单位验证状态不同的候选保守排除。

compare 的差异是第二项减第一项。原值差只表达接口记录差，不证明等重量或等份量；混合已知单位与未知单位时不计算该维度差值。所有命令不回答当前在售、库存、价格、医疗建议或账户信息。结果链接对应线上快照，外部新餐品可能尚未上站，不能用链接证明网页已同步。

独立包运行检查与真实 Agent 客户端使用是不同层次。当前 Actions 直接验证独立包；已有 [独立 Agent 调用记录](https://github.com/ayingQAQ/McCosmos/actions/runs/40034359098) 可查阅。CI 不调用个人认证 MCP，也不将这些检查称为所有客户端自动发现验证。
