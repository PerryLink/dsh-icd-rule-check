# dsh-icd-rule-check — ICD 合并编码与星剑号配对提示

[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-en.svg)](https://dsh.market/)

`dsh-icd-rule-check` 读取一份住院病案首页的编码记录——主要诊断、其他诊断、主要手术操作、其他手术操作以及入院病情代码——核对这份记录自身的结构与相互引用关系：诊断编码是否符合 ICD-10 形式、手术操作编码是否符合 ICD-9-CM-3 形式（形式核对前先剥离 † / * 标记）、同一编码是否被重复列出、星号编码在本份记录中是否与对应的剑号编码成对、是否填写了主要诊断、各条检查所需的栏目是否齐备。每条差异都附上它所依据的条款；无法执行的检查一律进 `skipped`，不会静默通过。它不做编码查表。

## 实际输出长什么样

![Terminal demo of dsh-icd-rule-check: real output over its IC-001 fixture](https://raw.githubusercontent.com/PerryLink/dsh-icd-rule-check/main/docs/assets/dsh-icd-rule-check-demo.png)

本插件对自己 `IC-001` 测试夹具的**真实输出**，不是示意图。规则库不伪造引文，因此每条发现都会同时写明所引条款，以及该条款原文本次未取得。

## 它回答什么问题

| 你会问 | 它怎么答 |
|---|---|
| 导出的诊断编码写的是 `A18.1†`，剑号会不会让形式核对报错？ | 不会。`IC-001` 在做形式核对前先剥离星剑号标记（† / *），标记本身不会产生差异。它只核对编码的形式：形式合规但在你所用目录中并不存在的编码仍然通过，因为核对这一点需要与编码员版本一致的授权目录。 |
| 主要诊断这一栏是空的，会报出什么？ | `IC-009` 会报出这份记录没有主要诊断，并提示补填。它的限度是：只核对这一栏是否填写，不判断被选作主要诊断的那一条是否正确——那是编码员的判断，本条不代为作出。 |
| 诊断列表里有一个星号编码，但没有与之对应的剑号编码。 | `IC-003` 会在对照表为该星号编码指定的剑号编码未出现在同一份记录中时报出它。这是本规则库中机械化程度最高的判定，且需要你自己在 `pairs` 里填对照表；`pairs` 留空时本条报告「无法执行」，而不是静默通过。它的限度就在配对本身：中文病案界「星号不能作主要诊断」的转述，本规则库不采用。 |
| 同一个诊断编码被列了两次。 | `IC-002` 会报出重复出现的编码，按「同一诊断被列两次」处理。本条封顶 `warn`：未找到明文规定不得重复，其依据是原则性条款，因此只把该行提示出来供复核，不作阻断。 |
| 主要诊断是 T82 系列并发症，诊断列表里没有其他诊断。 | `IC-011` 会报出该行。主要诊断落在 T80-T88 系列时，它只核对诊断列表中是否存在除主要诊断以外的其他诊断：条文要求「另编码」对该并发症进行说明，但未规定应另编哪一条，本条不代为决定，那属于编码员与所用目录的判断。 |
| `IC-005` 在我们的导出上从来不报任何东西，是不是说明主要手术与主要诊断相符？ | 不是。`IC-005` 出厂时 `correspondence` 对照表为空，它会在 `skipped` 里说明未配置对照表；那里的空结果不等于通过。按本机构的诊断→手术分组把 `correspondence` 填上（`procedures` 为空列表表示该组不应有主要手术），本条才开始比对。 |

## 依据的标准

| 文件 | 文号 | 引用它的规则 |
|---|---|---|
| 《住院病案首页数据填写质量规范（暂行）》 | 国卫办医发〔2016〕24号 | IC-001, IC-002, IC-004, IC-005, IC-007, IC-008, IC-009, IC-010, IC-012 |
| 《疾病和有关健康问题的国际统计分类》第十次修订本 第二卷 指导手册 | WHO ICD-10 Volume 2（第二版，2004，ISBN 92 4 154653 0） | IC-003 |
| 《疾病分类与代码》 | GB/T 14396-2016 | IC-003 |
| 《疾病分类与代码国家临床版 2.0》 | 国卫办医函〔2019〕371号 附件1 | IC-003 |
| 《医疗保障基金结算清单填写规范（试行）》 | 医保办发〔2020〕20号 | IC-005, IC-011, IC-006, IC-010, IC-012 |
| 《住院病案首页数据质量管理与控制指标（2016版）》 | 国卫办医发〔2016〕24号 | IC-009 |

**Boundary:** this plugin performs **structural** checks on the codes of one inpatient episode — code
form, duplicates, dagger/asterisk pairing, field completeness — and reports literal differences against
cited clauses. It is not `dsh-medrec-qc` (which checks the front sheet as a whole, including its logic
contradictions), not a code catalogue, and not an encoder. It never looks a code up: a catalogue lookup
needs a licensed code table whose version matches the coder's, and a version mismatch there produces
confident nonsense.

> ### ⚠️ What this plugin deliberately does **not** do, and why
>
> **It does not implement a combined-code (合并编码) rule, and it does not decide whether the principal
> procedure matches the principal diagnosis.** The task this plugin was built from flagged those as a
> critical-path risk: the rules are scattered across ICD user guides, the clinical-version handbook and
> encoder training material, with **no publicly quotable national clause** found for them. This rule
> pack is built on the rule that an entry whose basis cannot be quoted does not go in, so instead of
> inventing a clause number the pack provides a **parameterised hook** (`IC-005` `correspondence`) and
> ships it empty. Fill it in with your own catalogue's groupings, or leave it and read the `skipped`
> entry that says the check did not run.
>
> **The dagger/asterisk rule is capped at `warn` for the same reason.** The †/* system comes from the
> ICD-10 Volume 2 instruction manual († marks a condition classified here, * a manifestation classified
> elsewhere), and the pairing requirement is a structural consequence of that system — but the official
> Chinese text of Volume 2 was not obtainable online for verbatim quotation. `IC-003` therefore states
> in its own note that its basis is a principle and that the clause should be upgraded to `direct` once
> an authoritative text is secured. The comparison table ships empty too: the table version must match
> the coder's catalogue.

## Compatibility

| 项目 | 状态 |
|---|---|
| Harness | 对等版本范围 `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` —— 已实测同时接受 `0.2.0-rc.2` 与 `0.2.1-alpha.1`。**刻意不声明 `engines.dsh`**：它没有任何读取者，也无法拒装任何宿主 |
| Node | `^22.19.0 || >=24.0.0` |
| 平台 | 全平台（纯 ESM；无原生代码、无联网、不调用模型） |
| 工具模式 | `native` / `ptc` / `both` 均可；批量校验整个目录时建议 `ptc`，schema 成本只付一次 |

## What it does

规则表、字段说明与行为细节见 [README.md](README.md#what-it-does)（英文主版本）。本插件只列出材料与所引条款之间的字面差异，并对无法执行的检查在 `skipped` 中逐项说明。

## Install

```sh
dsh plugin --profile <name> add dsh-icd-rule-check
dsh --profile <name> --dump-config | grep 'dsh-icd-rule-check'
```

## Configuration

全部可调参数都在 `src/config.ts` 的 Schemastery schema 中，只改 `cordis.yml` 即可生效，无需改代码；逐条阈值在 `rules/` 下的规则库文件里。

| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `rulesFile` | string | `rules/icd-rule-check.yaml` | 规则库文件路径，相对插件包根目录 |
| `disabledRules` | string[] | `[]` | 要停用的规则 id 列表；每条都会出现在 `skipped` 中 |
| `onlyRules` | string[] | `[]` | 只执行这些规则 id；留空表示执行全部规则 |
| `skipNotes` | string | `""` | 附加到每条 `skipped` 说明后的备注 |
| `timeoutMs` | number | `120000` | 工具协作式超时预算（毫秒） |

## Material format

支持 JSON 与 YAML。完整字段示例见 [README.md](README.md#material-format)（英文主版本）。字段在读取层是可选的，由检查引擎校验，因此部分导出的材料会产生"缺项"类差异，而不是让程序崩溃。

## Rule sources

规则数据与代码分离，每条规则都带文件名、文号、按原文自身编号体系的条款号、逐字摘录与来源地址。加载期强制：摘录必须是真实引文且不少于八个字符；依据仅为原则性条款（`kind: derived-from-principle`，严重级上限 `warn`）或本机构配置（`kind: institutional-configuration`，上限 `info`）的检查不得标为 `error`。夸大依据的规则库会在加载期失败，而不会产出一份看起来很有底气的报告。

核验中确认的边界与"刻意没有作出的结论"见 [README.md](README.md#rule-sources)（英文主版本）与随包的 `rules/evidence/` 目录。

## Troubleshooting

- **插件装上了但工具不出现**：确认 `main` 指向 `lib/index.mjs` 且 `pnpm run build` 已生成该文件；`main` 写错会让加载器静默跳过该条目。
- **`dsh plugin add` 报版本不兼容**：peer 范围覆盖 `0.1.x` 与 `0.2.x`；若运行时在其之外，可显式豁免：`dsh plugin --profile <name> allow-version <包名@版本> --dsh-version <runtime> --accept-risk`
- **某条规则没有执行**：查看 `skipped` 数组，其中写明了规则 id 与原因。
- **`check` 报 `manifest-peers` 失败**：静态检查器比对的是一份早于 0.2 世代的硬编码 peer 范围；安装期的 peer 校验以运行时为准。这是 `dsh-plugin-dev` 的已知上游问题。
- **时间看起来偏移**：全部计算都是对输入字符串做墙上时钟运算，不做时区换算。

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
node ../scripts/sync-shared.mjs dsh-icd-rule-check
```

第 4 项把 `../_shared` 的共享件同步进 `src/shared/`；每次改动共享件后都要重跑。

## License

[Apache License 2.0](LICENSE) © 2026 dsh-icd-rule-check contributors.
