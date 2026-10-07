import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadRuleset } from '../src/shared/ruleset.ts'
import { parseMaterial } from '../src/parse.ts'
import { runCheck } from '../src/check.ts'
import { buildView } from '../src/view.ts'
import { findForbiddenWording } from '../src/shared/wording.ts'
import { addDays, diffDays, parseWallClock } from '../src/shared/datetime.ts'
import { parseYaml } from '../src/shared/yaml.ts'
import { bareCode, isAsterisk, isDagger } from '../src/model.ts'
import { Config as ConfigSchema } from '../src/config.ts'
import { inject, name as pluginName, resolvePackageFile, TOOL_NAME } from '../src/index.ts'
import type { Report } from '../src/shared/report.ts'
import type { CheckOptions } from '../src/check.ts'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(here, '..')
const rulesPath = join(packageRoot, 'rules', 'icd-rule-check.yaml')
const fixturesRoot = join(here, 'fixtures')
const CHECKED_AT = '2026-10-06T00:00:00.000Z'

interface CaseFile {
  ruleId: string
  configure?: Record<string, Record<string, unknown>>
  pairs: { name: string; material: string; expect: { ruleId: string; count: number } }[]
}

async function loadPack() {
  return loadRuleset(await readFile(rulesPath, 'utf8'))
}

function runOptions(overrides: Partial<CheckOptions> = {}): CheckOptions {
  return { plugin: pluginName, checkedAt: CHECKED_AT, disabledRules: [], onlyRules: [], ...overrides }
}

function withConfiguration(ruleset: Awaited<ReturnType<typeof loadPack>>, configure: CaseFile['configure']) {
  if (configure === undefined) return ruleset
  return {
    ...ruleset,
    rules: ruleset.rules.map((rule) =>
      configure[rule.id] === undefined ? rule : { ...rule, params: { ...rule.params, ...configure[rule.id] } },
    ),
  }
}

async function runFixture(materialText: string, target: string, configure?: CaseFile['configure']): Promise<Report> {
  const ruleset = withConfiguration(await loadPack(), configure)
  return runCheck(parseMaterial(materialText, target), ruleset, runOptions())
}

function issuesOf(report: Report, ruleId: string) {
  return report.issues.filter((issue) => issue.ruleId === ruleId)
}

async function ruleDirectories(): Promise<string[]> {
  const entries = await readdir(fixturesRoot, { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
}

async function readCases(directory: string): Promise<CaseFile> {
  return JSON.parse(await readFile(join(fixturesRoot, directory, 'cases.json'), 'utf8')) as CaseFile
}

const GOOD = {
  principalDiagnosis: { code: 'I21.900', name: '急性心肌梗死' },
  otherDiagnoses: [{ code: 'I10', name: '高血压' }],
  principalProcedure: { code: '36.0600', name: '冠状动脉支架植入术' },
  chiefComplaint: '突发胸痛 3 小时',
}

describe('rule pack', () => {
  it('declares a citable basis for every rule', async () => {
    const ruleset = await loadPack()
    expect(ruleset.plugin).toBe(pluginName)
    expect(ruleset.rules.length).toBeGreaterThanOrEqual(10)
    for (const rule of ruleset.rules) {
      expect(rule.basis.document, `${rule.id} document`).not.toBe('')
      expect(rule.basis.clause, `${rule.id} clause`).not.toBe('')
      expect(rule.basis.excerpt.length, `${rule.id} excerpt`).toBeGreaterThanOrEqual(8)
      expect(rule.basis.source, `${rule.id} source`).toMatch(/^https?:\/\//)
      expect(['direct', 'derived-from-principle', 'institutional-configuration']).toContain(rule.basis.kind)
    }
  })

  it('never lets a principle-derived or locally configured check be an error', async () => {
    const ruleset = await loadPack()
    for (const rule of ruleset.rules) {
      if (rule.basis.kind === 'derived-from-principle') expect(rule.severity, rule.id).not.toBe('error')
      if (rule.basis.kind === 'institutional-configuration') expect(rule.severity, rule.id).toBe('info')
    }
  })

  it('does not implement a combined-code rule, and says why in the rule pack', async () => {
    const ruleset = await loadPack()
    expect(ruleset.rules.some((rule) => rule.id === 'IC-005')).toBe(true)
    expect(ruleset.rules.some((rule) => /合并编码/.test(rule.title))).toBe(false)
    const source = await readFile(rulesPath, 'utf8')
    expect(source).toContain('找不到任何可逐字引用的公开"合并编码"规则清单')
    expect(source).toContain('本插件**不做编码查表**')
    expect(source).toContain('命中 0 次')
  })

  it('cites the WHO instruction manual for the asterisk rule, as a mechanically decidable check', async () => {
    const ruleset = await loadPack()
    const pairing = ruleset.rules.find((rule) => rule.id === 'IC-003')
    expect(pairing?.basis.kind).toBe('direct')
    expect(pairing?.severity).toBe('error')
    expect(pairing?.basis.excerpt).toContain('the asterisk code must never be used alone')
    expect(pairing?.basis.clause).toBe('3.1.3')
    expect(pairing?.alsoBasis?.some((extra) => extra.number === 'GB/T 14396-2016')).toBe(true)
    expect(pairing?.alsoBasis?.some((extra) => extra.number.includes('国卫办医函〔2019〕371号'))).toBe(true)
    // The colloquial over-reading must not appear.
    expect(pairing?.note).toContain('不是**"星号不能作主要诊断"')
  })

  it('implements the only quotable additional-code clause, limited to T80-T88', async () => {
    const ruleset = await loadPack()
    const additional = ruleset.rules.find((rule) => rule.id === 'IC-011')
    expect(additional?.basis.clause).toBe('附件1 说明一 8')
    expect(additional?.params.articles).toEqual(['T80', 'T81', 'T82', 'T83', 'T84', 'T85', 'T86', 'T87', 'T88'])
    expect(additional?.note).toContain('唯一可逐字引用的"另编码"明文')
  })

  it('narrows the chapter XVIII rule to the two conditions it can actually see', async () => {
    const ruleset = await loadPack()
    const symptom = ruleset.rules.find((rule) => rule.id === 'IC-012')
    expect(symptom?.severity).toBe('warn')
    expect(symptom?.note).toContain('本插件无法自动完成')
    expect(symptom?.note).toContain('出院时诊断仍不明确')
  })

  it('ships the catalogue-dependent switches off', async () => {
    const ruleset = await loadPack()
    expect(ruleset.rules.find((rule) => rule.id === 'IC-003')?.params.pairs).toEqual([])
    expect(ruleset.rules.find((rule) => rule.id === 'IC-004')?.params.flagAsteriskUse).toBe(false)
    expect(ruleset.rules.find((rule) => rule.id === 'IC-005')?.params.correspondence).toEqual([])
    expect(ruleset.rules.find((rule) => rule.id === 'IC-010')?.params.requireNames).toBe(false)
  })

  it('refuses a rule pack that overstates a principle-derived check', () => {
    const overstated = [
      'plugin: probe',
      'version: "0"',
      'rules:',
      '  - id: X-001',
      '    title: probe',
      '    severity: error',
      '    basis:',
      '      document: 《X》',
      '      number: X〔2020〕1号',
      '      clause: 第一条',
      '      excerpt: 这是一个足够长的逐字摘录示例。',
      '      kind: derived-from-principle',
      '      source: https://example.invalid/x',
    ].join('\n')
    expect(() => loadRuleset(overstated)).toThrow(/strongest permitted severity/)
  })
})

describe('paired fixtures', () => {
  it('has both a compliant and a violating sample for every rule', async () => {
    const ruleset = await loadPack()
    const covered = new Set<string>()
    for (const directory of await ruleDirectories()) {
      const cases = await readCases(directory)
      expect(cases.pairs.filter((pair) => pair.expect.count === 0).length, `${directory} compliant sample`).toBeGreaterThanOrEqual(1)
      expect(cases.pairs.filter((pair) => pair.expect.count > 0).length, `${directory} violating sample`).toBeGreaterThanOrEqual(1)
      for (const pair of cases.pairs) {
        const material = await readFile(join(fixturesRoot, directory, pair.material), 'utf8')
        const report = await runFixture(material, pair.material, cases.configure)
        const matched = issuesOf(report, cases.ruleId)
        expect(
          matched.length,
          `${directory}/${pair.name} expected ${pair.expect.count} × ${cases.ruleId}, got ${matched.map((issue) => issue.found).join(' | ')}`,
        ).toBe(pair.expect.count)
        covered.add(cases.ruleId)
      }
    }
    for (const rule of ruleset.rules) expect(covered.has(rule.id), `covered ${rule.id}`).toBe(true)
  })

  it('gives every issue a citable basis and a stable id', async () => {
    for (const directory of await ruleDirectories()) {
      const cases = await readCases(directory)
      for (const pair of cases.pairs) {
        const material = await readFile(join(fixturesRoot, directory, pair.material), 'utf8')
        const report = await runFixture(material, pair.material, cases.configure)
        for (const issue of report.issues) {
          expect(issue.basis).toContain('「')
          expect(issue.id).toMatch(/^dsh-icd-rule-check\.IC-\d{3}\.[0-9a-f]{8}$/)
          expect(issue.found).not.toBe('')
          expect(issue.expected).not.toBe('')
        }
      }
    }
  })
})

describe('code structure helpers', () => {
  it('recognises and strips the dagger and asterisk markers', () => {
    expect(isDagger('A18.1†')).toBe(true)
    expect(isAsterisk('N51.0*')).toBe(true)
    expect(isDagger('N51.0*')).toBe(false)
    expect(bareCode('A18.1†')).toBe('A18.1')
    expect(bareCode('N51.0*')).toBe('N51.0')
  })

  it('never lets a marker trip the format check', async () => {
    const ruleset = await loadPack()
    const material = JSON.stringify({
      principalDiagnosis: { code: 'A18.1†', name: '泌尿生殖道结核' },
      otherDiagnoses: [{ code: 'N51.0*', name: '男性生殖器官结核' }],
    })
    const report = runCheck(parseMaterial(material, 'inline'), ruleset, runOptions())
    expect(issuesOf(report, 'IC-001')).toHaveLength(0)
    expect(issuesOf(report, 'IC-007')).toHaveLength(0)
  })

  it('reports a duplicate only once even when a code appears three times', async () => {
    const ruleset = await loadPack()
    const material = JSON.stringify({
      principalDiagnosis: { code: 'I10', name: '高血压' },
      otherDiagnoses: [{ code: 'I10' }, { code: 'I10' }],
    })
    const report = runCheck(parseMaterial(material, 'inline'), ruleset, runOptions())
    expect(issuesOf(report, 'IC-002')).toHaveLength(1)
  })
})

describe('skipped reporting', () => {
  it('admits when a catalogue-dependent check has no table configured', async () => {
    const ruleset = await loadPack()
    const material = JSON.stringify({
      principalDiagnosis: { code: 'A18.1†', name: '泌尿生殖道结核' },
      otherDiagnoses: [{ code: 'N51.0*', name: '男性生殖器官结核' }],
    })
    const report = runCheck(parseMaterial(material, 'inline'), ruleset, runOptions())
    expect(issuesOf(report, 'IC-003').length).toBe(0)
    expect(report.skipped.find((entry) => entry.rule === 'IC-003')?.reason).toContain('pairs')
  })

  it('admits when the material carries no asterisk marker at all', async () => {
    const report = await runFixture(JSON.stringify(GOOD), 'inline')
    expect(report.skipped.find((entry) => entry.rule === 'IC-003')?.reason).toContain('星剑号')
  })

  it('names disabled rules exactly once and appends the configured note', async () => {
    const ruleset = await loadPack()
    const input = parseMaterial(JSON.stringify(GOOD), 'inline')
    const report = runCheck(input, ruleset, runOptions({ disabledRules: ['IC-008'], skipNotes: '本机构编码口径' }))
    const entries = report.skipped.filter((item) => item.rule === 'IC-008')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.reason).toContain('禁用')
    expect(entries[0]?.reason).toContain('本机构编码口径')
  })
})

describe('report rendering', () => {
  it('never uses adjudicating wording and always carries the disclaimer', async () => {
    const material = await readFile(join(fixturesRoot, 'IC-006', 'IC-006-unsafe.json'), 'utf8')
    const report = await runFixture(material, 'IC-006-unsafe.json')
    const view = buildView(report)
    expect(findForbiddenWording(view.markdown)).toEqual([])
    expect(view.markdown).toContain('免责声明')
    expect(view.markdown).toContain('未执行的检查')
    expect(JSON.parse(view.reportJson)).toMatchObject({ plugin: pluginName, summary: report.summary })
  })
})

describe('plugin contract', () => {
  it('declares a static inject array covering every service apply touches', () => {
    expect(Array.isArray(inject)).toBe(true)
    expect(inject).toContain('tools')
  })

  it('exposes a Schemastery Config with serializable defaults', () => {
    const resolved = ConfigSchema(null)
    expect(resolved.rulesFile).toBe('rules/icd-rule-check.yaml')
    expect(resolved.disabledRules).toEqual([])
    expect(resolved.timeoutMs).toBeGreaterThan(0)
  })

  it('resolves the packaged rule pack and rejects a missing one', () => {
    expect(resolvePackageFile('rules/icd-rule-check.yaml')).toBe(rulesPath)
    expect(() => resolvePackageFile('rules/does-not-exist.yaml')).toThrow(/未找到/)
  })

  it('names the tool after the package family convention', () => {
    expect(TOOL_NAME).toBe('icd_rule_check')
  })
})

describe('material reader', () => {
  it('rejects empty material instead of reporting an empty result', () => {
    expect(() => parseMaterial('   ', 'inline')).toThrow(/材料为空/)
  })

  it('rejects material with no coded entry at all', () => {
    expect(() => parseMaterial('chiefComplaint: 胸痛', 'inline')).toThrow(/无法执行检查/)
  })

  it('accepts a bare code string for an entry', () => {
    const input = parseMaterial(JSON.stringify({ principalDiagnosis: 'I21.900' }), 'inline')
    expect(input.principalDiagnosis?.code).toBe('I21.900')
  })
})

describe('shared kit', () => {
  it('parses wall-clock timestamps and rejects impossible dates', () => {
    expect(parseWallClock('2026-03-15')).toEqual({ date: '2026-03-15', time: '00:00', hasTime: false, minutes: 0 })
    expect(parseWallClock('2026-02-30')).toBeUndefined()
  })

  it('does calendar arithmetic', () => {
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01')
    expect(diffDays('2026-03-01', '2026-03-06')).toBe(5)
  })

  it('reads the supported YAML subset and rejects the rest', () => {
    expect(parseYaml('a: 1\nb:\n  - x\n')).toEqual({ a: 1, b: ['x'] })
    expect(() => parseYaml('a: 1\na: 2\n')).toThrow(/duplicate/)
  })
})
