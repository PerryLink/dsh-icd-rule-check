import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, isAbsolute, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { Config } from './config.ts'
import type { Config as ConfigShape } from './config.ts'
import { runCheck } from './check.ts'
import { MaterialError, parseMaterial } from './parse.ts'
import { buildView } from './view.ts'
import { loadRulesetFile } from './shared/memo.ts'

export const name = 'dsh-icd-rule-check'
export const inject = ['tools']
export { Config }

/** Tool id exposed to the model, and the row id in `cordis.patch.yml`. */
export const TOOL_NAME = 'icd_rule_check'

/**
 * Locate a package-owned file such as the rule pack.
 *
 * Resolution order: absolute path, then every ancestor of the module directory,
 * then the process working directory. A wrong silent fallback would build a
 * report from the wrong rule pack, so a miss throws with the paths tried.
 *
 * @param relative - configured path, relative to the plugin package root.
 * @returns the resolved absolute path.
 * @throws Error naming every location tried, when the file is absent.
 */
export function resolvePackageFile(relative: string): string {
  if (isAbsolute(relative)) {
    if (existsSync(relative)) return relative
    throw new Error(`规则库文件不存在：${relative}`)
  }
  const tried: string[] = []
  let current = import.meta.dirname ?? process.cwd()
  for (;;) {
    const candidate = resolve(current, relative)
    tried.push(candidate)
    if (existsSync(candidate)) return candidate
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  const fromCwd = resolve(process.cwd(), relative)
  if (!tried.includes(fromCwd)) {
    tried.push(fromCwd)
    if (existsSync(fromCwd)) return fromCwd
  }
  throw new Error(`规则库文件未找到：${relative}；已尝试 ${tried.length} 个位置，最近一处为 ${tried[0] ?? ''}`)
}

/** Read material from a file path or use the inline text as-is. */
/** Build one coded episode from long-format rows (`类型`, `编码`, `名称`, `入院病情`). */
function episodeFromRows(rows: Record<string, string>[]): Record<string, unknown> {
  const pick = (row: Record<string, string>, names: string[]): string => {
    for (const name of names) {
      const value = row[name]
      if (typeof value === 'string' && value.trim() !== '') return value.trim()
    }
    return ''
  }
  const kindOf = (row: Record<string, string>): string => pick(row, ['类型', 'type', '类别']).toLowerCase().replace(/\s/gu, '')
  const codeOf = (row: Record<string, string>): string => pick(row, ['编码', 'code', '诊断编码', '手术编码'])
  const nameOf = (row: Record<string, string>): string => pick(row, ['名称', 'name', '诊断名称', '手术名称'])
  const entry = (row: Record<string, string>): { code: string; name?: string } => ({ code: codeOf(row), ...(nameOf(row) === '' ? {} : { name: nameOf(row) }) })

  const episode: Record<string, unknown> = { otherDiagnoses: [], otherProcedures: [], admissionCondition: {} }
  for (const row of rows) {
    const kind = kindOf(row)
    const code = codeOf(row)
    if (code === '') continue
    if (kind.includes('主要诊断') || kind === 'principaldiagnosis') episode.principalDiagnosis = entry(row)
    else if (kind.includes('其他诊断') || kind.includes('次要诊断') || kind === 'otherdiagnosis') (episode.otherDiagnoses as unknown[]).push(entry(row))
    else if (kind.includes('主要手术') || kind === 'principalprocedure') episode.principalProcedure = entry(row)
    else if (kind.includes('其他手术') || kind === 'otherprocedure') (episode.otherProcedures as unknown[]).push(entry(row))
  }
  const admission = rows.map((row) => codeOf(row) === '' ? undefined : [codeOf(row), pick(row, ['入院病情', 'admissionCondition'])] as const).filter((item): item is readonly [string, string] => item !== undefined && item[1] !== '')
  if (admission.length > 0) episode.admissionCondition = Object.fromEntries(admission)
  if (episode.principalDiagnosis === undefined && (episode.otherDiagnoses as unknown[]).length === 0 && (episode.otherProcedures as unknown[]).length === 0) {
    throw new MaterialError('文档中没有可识别的诊断/手术行；请提供「类型/编码/名称」三列，类型写主要诊断、其他诊断、主要手术或其他手术')
  }
  return episode
}

async function readMaterial(file: string | undefined, material: string | undefined, signal: AbortSignal): Promise<{ text: string; target: string }> {
  if (file !== undefined && file.trim() !== '') {
    const path = resolve(file)
    signal.throwIfAborted()
    const extension = extname(path).toLowerCase()
    if (['.docx', '.xlsx', '.xlsm', '.csv', '.tsv'].includes(extension)) {
      let ingestToTable: (source: Buffer, filename: string, options: Record<string, unknown>) => { ok: boolean; table?: { rows: Record<string, string>[] }; error?: string }
      try {
        const api = (await import('dsh-table-ingest/api')) as {
          ingestToTable: (source: Buffer, filename: string, options: Record<string, unknown>) => { ok: boolean; table?: { rows: Record<string, string>[] }; error?: string }
        }
        ingestToTable = api.ingestToTable
      } catch {
        throw new MaterialError('要直接读 Word/Excel/CSV，请先安装 dsh-table-ingest（dsh plugin --profile <name> add dsh-table-ingest），或先把材料转成 JSON/YAML。')
      }
      const buffer = await readFile(path, { signal })
      const table = ingestToTable(buffer, path, {})
      if (!table.ok || table.table === undefined) throw new MaterialError(`无法从 ${path} 抽出表格：${table.error ?? '未知原因'}`)
      return { text: JSON.stringify({ target: path, ...episodeFromRows(table.table.rows) }), target: path }
    }
    const text = await readFile(path, { encoding: 'utf8', signal })
    return { text, target: path }
  }
  if (material !== undefined && material.trim() !== '') return { text: material, target: '(内联材料)' }
  throw new MaterialError('必须提供 file 或 material 之一')
}

/**
 * Register the checker tool.
 *
 * Registration is an effect: `ctx.tools.register` returns the disposer that
 * removes the tool when this plugin unloads, which is what keeps the plugin
 * hot-reloadable.
 *
 * @param ctx - plugin context, with `tools` already available.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: ConfigShape): () => void {
  return ctx.tools.register(
    defineTool({
      name: TOOL_NAME,
      description:
        'ICD 合并编码与星剑号配对提示（依据 GB/T 14396-2016 与公开的 ICD 使用说明，仅提示差异，不作出定性结论）本工具只列出材料与所引条款之间的字面差异，供人工复核，不作出任何定性结论。' +
        '材料为 JSON 或 YAML；无法执行的检查会列在 skipped 中。',
      parameters: {
        file: { type: 'string', description: '材料文件绝对路径（JSON/YAML，或 .docx/.xlsx/.xlsm/.csv/.tsv；文档需「类型/编码/名称」三列，且需安装 dsh-table-ingest）。与 material 二选一。' },
        material: { type: 'string', description: '内联材料文本（JSON 或 YAML）。与 file 二选一。' },
        rulesFile: { type: 'string', description: '覆盖配置中的规则库路径（相对插件包根或绝对路径）。' },
        only: {
          type: 'array',
          items: { type: 'string' },
          description: '只执行这些规则 id；留空表示执行全部规则。',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            plugin: { type: 'string' },
            target: { type: 'string' },
            checkedAt: { type: 'string' },
            rulesetVersion: { type: 'string' },
            summary: {
              type: 'object',
              additionalProperties: false,
              properties: {
                error: { type: 'integer' },
                warn: { type: 'integer' },
                info: { type: 'integer' },
              },
            },
            issueCount: { type: 'integer' },
            skippedCount: { type: 'integer' },
            execution: {
              type: 'object',
              additionalProperties: false,
              properties: {
                total: { type: 'integer' },
                executed: { type: 'integer' },
                skipped: { type: 'integer' },
                manual: { type: 'integer' },
                unsupported: { type: 'integer' },
              },
            },
            markdown: { type: 'string' },
            reportJson: { type: 'string' },
          },
        },
        render: (_args, value) => [{ type: 'text', text: (value as { markdown: string }).markdown }],
      },
      timeoutMs: config.timeoutMs,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const relative = args.rulesFile !== undefined && args.rulesFile.trim() !== '' ? args.rulesFile : config.rulesFile
        const [material, ruleset] = await Promise.all([
          readMaterial(args.file, args.material, exec.signal),
          loadRulesetFile(resolvePackageFile(relative)),
        ])
        exec.signal.throwIfAborted()
        const input = parseMaterial(material.text, material.target)
        const only = (args.only ?? []).length > 0 ? (args.only as string[]) : config.onlyRules
        const report = runCheck(input, ruleset, {
          plugin: name,
          checkedAt: new Date().toISOString(),
          disabledRules: config.disabledRules,
          onlyRules: only,
          skipNotes: config.skipNotes === '' ? undefined : config.skipNotes,
        })
        return buildView(report)
      },
    }),
  )
}
