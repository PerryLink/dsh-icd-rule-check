/**
 * Pure check core: `(input, ruleset, options) => Report`.
 *
 * No plugin context, no I/O, no clock and no model access, so the whole rule set
 * is unit-testable without credentials. Every finding carries the verbatim
 * clause that produced it, and every check that could not run is reported in
 * `skipped` so an empty issue list can never be read as "nothing is wrong".
 *
 * The checks are deliberately **structural**: they look at the shape of the
 * codes and at how the entries relate to each other. Nothing here looks a code
 * up in a catalogue, because that would require a licensed code table whose
 * version matches the coder's, and a version mismatch there produces confident
 * nonsense. The one rule that needs a mapping table (dagger-to-asterisk) takes
 * that table from the rule pack, where a deployment can supply the version it
 * uses.
 */

import { disabledAsSkipped, formatBasis } from './shared/rules.ts'
import { paramNumber, paramStrings, ruleById } from './shared/ruleset.ts'
import { issueId, makeReport } from './shared/report.ts'
import type { Issue, Locator, Report, Skipped } from './shared/report.ts'
import type { Ruleset } from './shared/rules.ts'
import { bareCode, isAsterisk, isDagger } from './model.ts'
import type { CodedEntry, IcdInput } from './model.ts'

/** Options that come from the plugin configuration rather than the rule pack. */
export interface CheckOptions {
  plugin: string
  checkedAt: string
  disabledRules: readonly string[]
  onlyRules: readonly string[]
  skipNotes?: string
}

interface RuleContext {
  input: IcdInput
  ruleset: Ruleset
  issues: Issue[]
  skipped: Skipped[]
  fired: Set<string>
  skipReasons: Map<string, string>
  add(ruleId: string, locator: Locator, found: string, expected: string, fix?: string): void
  skip(ruleId: string, reason: string): void
}

/** Every diagnosis entry, principal first, with its role label. */
function allDiagnoses(input: IcdInput): { entry: CodedEntry; role: 'principal' | 'other'; index: number }[] {
  const out: { entry: CodedEntry; role: 'principal' | 'other'; index: number }[] = []
  if (input.principalDiagnosis !== undefined) out.push({ entry: input.principalDiagnosis, role: 'principal', index: 0 })
  input.otherDiagnoses.forEach((entry, index) => out.push({ entry, role: 'other', index }))
  return out
}

/** Every procedure entry, principal first. */
function allProcedures(input: IcdInput): { entry: CodedEntry; role: 'principal' | 'other'; index: number }[] {
  const out: { entry: CodedEntry; role: 'principal' | 'other'; index: number }[] = []
  if (input.principalProcedure !== undefined) out.push({ entry: input.principalProcedure, role: 'principal', index: 0 })
  input.otherProcedures.forEach((entry, index) => out.push({ entry, role: 'other', index }))
  return out
}

function locatorOf(entry: CodedEntry, role: 'principal' | 'other'): Locator {
  const locator: Locator = { column: role === 'principal' ? '主要诊断' : '其他诊断', cell: entry.code }
  if (entry.row !== undefined) locator.row = entry.row
  return locator
}

function basisOf(ruleset: Ruleset, ruleId: string): string {
  const rule = ruleById(ruleset, ruleId)
  return formatBasis(rule.basis, rule.alsoBasis ?? [])
}

function makeAdd(context: Omit<RuleContext, 'add' | 'skip'>): RuleContext['add'] {
  return (ruleId, locator, found, expected, fix) => {
    const rule = ruleById(context.ruleset, ruleId)
    const issue: Issue = {
      id: issueId(context.ruleset.plugin, ruleId, locator),
      ruleId,
      severity: rule.severity,
      locator,
      found,
      expected,
      basis: formatBasis(rule.basis, rule.alsoBasis ?? []),
    }
    if (fix !== undefined) issue.fix = fix
    context.issues.push(issue)
    context.fired.add(ruleId)
  }
}

/** IC-001 — every diagnosis code has ICD-10 form, markers aside. */
function checkDiagnosisFormat(context: RuleContext): void {
  const ruleId = 'IC-001'
  const rule = ruleById(context.ruleset, ruleId)
  const pattern = typeof rule.params.pattern === 'string' ? rule.params.pattern : '^[A-Z][0-9]{2}(\\.[0-9A-Z]{1,4})?$'
  const matcher = new RegExp(pattern)
  const diagnoses = allDiagnoses(context.input)
  if (diagnoses.length === 0) {
    context.skip(ruleId, '材料中没有诊断记录')
    return
  }
  for (const { entry, role } of diagnoses) {
    const bare = bareCode(entry.code)
    if (bare === '') {
      context.add(ruleId, locatorOf(entry, role), '诊断编码为空', '诊断编码应填写且符合 ICD-10 形式', '补填编码')
      continue
    }
    if (matcher.test(bare)) continue
    context.add(
      ruleId,
      locatorOf(entry, role),
      `诊断编码「${entry.code}」不符合 ICD-10 形式`,
      `疾病诊断编码应当统一使用 ICD-10，形式为 ${pattern}`,
      '核对编码；本条只做形式核对，不校验该编码是否存在于某一版本目录中',
    )
  }
}

/** IC-002 — every code in one episode appears once. */
function checkDuplicateCodes(context: RuleContext): void {
  const ruleId = 'IC-002'
  const seen = new Map<string, { entry: CodedEntry; role: 'principal' | 'other' }>()
  const duplicates: { entry: CodedEntry; role: 'principal' | 'other'; first: CodedEntry }[] = []
  for (const item of allDiagnoses(context.input)) {
    const key = bareCode(item.entry.code).toUpperCase()
    if (key === '') continue
    const previous = seen.get(key)
    if (previous === undefined) seen.set(key, item)
    else if (!duplicates.some((entry) => bareCode(entry.entry.code).toUpperCase() === key)) {
      duplicates.push({ ...item, first: previous.entry })
    }
  }
  if (seen.size === 0) {
    context.skip(ruleId, '材料中没有可比较的诊断编码')
    return
  }
  for (const duplicate of duplicates) {
    context.add(
      ruleId,
      locatorOf(duplicate.entry, duplicate.role),
      `诊断编码「${duplicate.entry.code}」在本份材料中重复出现`,
      '同一次住院的诊断列表不应重复列出同一编码',
      '删除重复项，或改为可区分的具体编码',
    )
  }
}

/**
 * IC-003 — an asterisk code cannot stand alone.
 *
 * This is the one mechanically decidable rule in the asterisk/dagger system: the
 * asterisk marks a manifestation that is classified elsewhere, so a list that
 * carries an asterisk without its dagger is internally incomplete. The mapping
 * between the two comes from the rule pack, so a deployment supplies the table
 * version it uses.
 */
function checkAsteriskPairing(context: RuleContext): void {
  const ruleId = 'IC-003'
  const rule = ruleById(context.ruleset, ruleId)
  const pairs = Array.isArray(rule.params.pairs) ? (rule.params.pairs as { dagger?: unknown; asterisk?: unknown }[]) : []
  const diagnoses = allDiagnoses(context.input)
  const asterisks = diagnoses.filter((item) => isAsterisk(item.entry.code) || isDagger(item.entry.code))
  if (asterisks.length === 0) {
    context.skip(ruleId, '材料中的诊断编码均未使用星剑号（† / *）标记')
    return
  }
  if (pairs.length === 0) {
    context.skip(ruleId, '规则库未配置 pairs（剑号↔星号对照表），无法判断配对是否成立')
    return
  }
  const present = new Set(diagnoses.map((item) => bareCode(item.entry.code).toUpperCase()))
  const daggerToAsterisk = new Map<string, string>()
  for (const pair of pairs) {
    if (typeof pair.dagger !== 'string' || typeof pair.asterisk !== 'string') continue
    daggerToAsterisk.set(pair.dagger.toUpperCase(), pair.asterisk.toUpperCase())
  }
  if (daggerToAsterisk.size === 0) {
    context.skip(ruleId, '规则库配置的 pairs 中没有成对有效条目')
    return
  }
  for (const item of diagnoses) {
    const bare = bareCode(item.entry.code).toUpperCase()
    if (!isAsterisk(item.entry.code)) continue
    // Find which dagger the rule pack says this asterisk belongs to.
    const owners = [...daggerToAsterisk.entries()].filter(([, asterisk]) => asterisk === bare).map(([dagger]) => dagger)
    if (owners.length === 0) {
      context.add(
        ruleId,
        locatorOf(item.entry, item.role),
        `星号编码「${item.entry.code}」在规则库的对照表中没有对应的剑号编码`,
        '星号编码属于他处分类的临床表现，应与对应的剑号编码成对出现',
        '核对编码或用本机构使用的对照表替换规则库中的 pairs',
      )
      continue
    }
    if (owners.some((dagger) => present.has(dagger))) continue
    context.add(
      ruleId,
      locatorOf(item.entry, item.role),
      `星号编码「${item.entry.code}」出现，但材料中没有对应的剑号编码 ${owners.join(' / ')}`,
      '星号编码属于他处分类的临床表现，应与对应的剑号编码成对出现',
      '补充剑号编码，或确认该条目是否应当使用星剑号形式',
    )
  }
}

/**
 * IC-004 — the current Chinese code sets dropped the asterisk form.
 *
 * Reported as `info` because the rule pack ships the switch off: whether a given
 * catalogue still uses the asterisk belongs to the coder's code table version,
 * not to a fixed rule.
 */
function checkAsteriskRetired(context: RuleContext): void {
  const ruleId = 'IC-004'
  const rule = ruleById(context.ruleset, ruleId)
  const flag = rule.params.flagAsteriskUse === true
  const asterisks = allDiagnoses(context.input).filter((item) => isAsterisk(item.entry.code))
  if (!flag) {
    context.skip(ruleId, '规则库未启用 flagAsteriskUse：是否仍使用星号取决于本机构所用编码目录版本')
    return
  }
  if (asterisks.length === 0) return
  for (const item of asterisks) {
    context.add(
      ruleId,
      locatorOf(item.entry, item.role),
      `诊断编码「${item.entry.code}」使用了星号（*）形式`,
      '按本机构配置，星剑号形式在当前所用编码目录中已不再使用',
      '核对本机构所用《疾病分类与代码》版本；本条为提示级，不判断该形式本身是否恰当',
    )
  }
}

/** IC-005 — the principal procedure should correspond to the principal diagnosis. */
function checkPrincipalCorrespondence(context: RuleContext): void {
  const ruleId = 'IC-005'
  const rule = ruleById(context.ruleset, ruleId)
  const table = Array.isArray(rule.params.correspondence)
    ? (rule.params.correspondence as { diagnosis?: unknown; procedures?: unknown }[])
    : []
  const principalDiagnosis = context.input.principalDiagnosis
  if (principalDiagnosis === undefined) {
    context.skip(ruleId, '材料未提供主要诊断，无法与主要手术操作对照')
    return
  }
  const principalProcedure = context.input.principalProcedure
  if (principalProcedure === undefined) {
    context.skip(ruleId, '材料未提供主要手术操作，本条不适用')
    return
  }
  if (table.length === 0) {
    context.skip(
      ruleId,
      '规则库未配置 correspondence：诊断与手术的相容关系需要编码目录支持，本规则库不硬编码对照关系',
    )
    return
  }
  const diagnosisPrefix = bareCode(principalDiagnosis.code).toUpperCase()
  const procedurePrefix = bareCode(principalProcedure.code).toUpperCase()
  for (const group of table) {
    if (typeof group.diagnosis !== 'string' && !Array.isArray(group.diagnosis)) continue
    if (!Array.isArray(group.procedures)) continue
    const diagnoses = Array.isArray(group.diagnosis) ? group.diagnosis : [group.diagnosis]
    const inGroup = diagnoses.some((value) => typeof value === 'string' && diagnosisPrefix.startsWith(value.toUpperCase()))
    if (!inGroup) continue
    const allowed = group.procedures.filter((value): value is string => typeof value === 'string')
    // An empty procedure list means the group is "no operation expected here".
    if (allowed.length === 0) {
      context.add(
        ruleId,
        { column: '主要手术', cell: principalProcedure.code },
        `主要诊断为「${principalDiagnosis.code}」，按本机构对照表该组不应有主要手术操作，但填写了「${principalProcedure.code}」`,
        '主要手术操作应与主要诊断相对应',
        '核对主要诊断与主要手术的选择；本条的对照关系来自本机构配置',
      )
      continue
    }
    if (allowed.some((value) => procedurePrefix.startsWith(value.toUpperCase()))) continue
    context.add(
      ruleId,
      { column: '主要手术', cell: principalProcedure.code },
      `主要诊断「${principalDiagnosis.code}」与主要手术操作「${principalProcedure.code}」不在同一对照组内`,
      '主要手术操作应与主要诊断相对应',
      '核对主要诊断与主要手术的选择；本条的对照关系来自本机构配置，配置为空时不执行',
    )
  }
}

/** IC-006 — a "rule out" diagnosis must not be the principal diagnosis. */
function checkAdmissionCondition(context: RuleContext): void {
  const ruleId = 'IC-006'
  const rule = ruleById(context.ruleset, ruleId)
  const flagCode = typeof rule.params.flagCode === 'string' ? rule.params.flagCode : '4'
  const entry = context.input.principalDiagnosis
  if (entry === undefined) {
    context.skip(ruleId, '材料未提供主要诊断')
    return
  }
  if (Object.keys(context.input.admissionCondition).length === 0) {
    context.skip(ruleId, `材料未提供 admissionCondition（入院病情代码），无法判断是否属于代码 ${flagCode} 的情形`)
    return
  }
  const condition =
    context.input.admissionCondition[entry.code] ??
    context.input.admissionCondition[bareCode(entry.code)] ??
    context.input.admissionCondition['principal']
  if (condition === undefined) {
    context.skip(ruleId, `入院病情代码中未包含主要诊断「${entry.code}」，本条不执行`)
    return
  }
  if (condition !== flagCode) return
  context.add(
    ruleId,
    locatorOf(entry, 'principal'),
    `主要诊断「${entry.code}」的入院病情代码为 ${flagCode}`,
    '入院病情为「无」的诊断原则上不应作为主要诊断',
    '核对主要诊断的选择；本条依据为编码填报口径，须由编码员复核',
  )
}

/** IC-007 — the principal procedure code has ICD-9-CM-3 form. */
function checkProcedureFormat(context: RuleContext): void {
  const ruleId = 'IC-007'
  const rule = ruleById(context.ruleset, ruleId)
  const pattern = typeof rule.params.pattern === 'string' ? rule.params.pattern : '^[0-9]{2}(\\.[0-9]{1,4})?$'
  const matcher = new RegExp(pattern)
  const procedures = allProcedures(context.input)
  if (procedures.length === 0) {
    context.skip(ruleId, '材料中没有手术操作记录')
    return
  }
  for (const { entry, role } of procedures) {
    const bare = bareCode(entry.code)
    if (bare === '') {
      context.add(ruleId, locatorOf(entry, role), '手术操作编码为空', '手术操作编码应填写且符合 ICD-9-CM-3 形式', '补填编码')
      continue
    }
    if (matcher.test(bare)) continue
    context.add(
      ruleId,
      locatorOf(entry, role),
      `手术操作编码「${entry.code}」不符合 ICD-9-CM-3 形式`,
      `手术和操作编码应当统一使用 ICD-9-CM-3，形式为 ${pattern}`,
      '核对编码；本条只做形式核对，不校验该编码是否存在于某一版本目录中',
    )
  }
}

/** IC-008 — the material states why the patient was admitted. */
function checkChiefComplaint(context: RuleContext): void {
  const ruleId = 'IC-008'
  const value = context.input.fields.chiefComplaint
  if (value === undefined) {
    context.skip(ruleId, '材料未提供 chiefComplaint 字段，无法核对其是否与诊断列表呼应')
    return
  }
  if (context.input.principalDiagnosis === undefined && context.input.otherDiagnoses.length === 0) {
    context.skip(ruleId, '材料中没有诊断记录可与主诉呼应')
    return
  }
  const names = [
    context.input.principalDiagnosis?.name,
    ...context.input.otherDiagnoses.map((entry) => entry.name),
  ].filter((entry): entry is string => entry !== undefined && entry.trim() !== '')
  if (names.length === 0) {
    context.skip(ruleId, '材料中的诊断只提供了编码、没有名称，无法与主诉做字面呼应')
    return
  }
  // A literal overlap check only; the rule caps at info because deciding whether a
  // diagnosis "matches" a complaint is a coding judgement, not a string operation.
  const complaint = value.replace(/\s+/g, '')
  const hit = names.some((name) => {
    const trimmed = name.replace(/\s+/g, '')
    if (trimmed.length < 2) return false
    for (let length = Math.min(trimmed.length, 6); length >= 2; length--) {
      for (let start = 0; start + length <= trimmed.length; start++) {
        if (complaint.includes(trimmed.slice(start, start + length))) return true
      }
    }
    return false
  })
  if (hit) return
  context.add(
    ruleId,
    { column: 'chiefComplaint' },
    `主诉「${value}」与诊断名称（${names.join('、')}）没有可识别的字面重叠`,
    '主要诊断一般是患者住院的理由',
    '核对主要诊断与主诉的对应关系；本条只做字面重叠提示，不判断临床对应关系',
  )
}

/** IC-009 — a principal diagnosis is present. */
function checkPrincipalPresent(context: RuleContext): void {
  const ruleId = 'IC-009'
  const rule = ruleById(context.ruleset, ruleId)
  if (rule.params.requirePrincipalDiagnosis === false) {
    context.skip(ruleId, '规则库配置为不要求主要诊断，本条不执行')
    return
  }
  if (context.input.principalDiagnosis !== undefined) return
  context.add(
    ruleId,
    { column: '主要诊断' },
    '材料中没有主要诊断',
    '病案首页的主要诊断应当填写',
    '补填主要诊断；本条只核对是否填写，不判断选择是否正确',
  )
}

/** IC-010 — diagnoses carry names, not only codes. */
function checkDiagnosisNames(context: RuleContext): void {
  const ruleId = 'IC-010'
  const rule = ruleById(context.ruleset, ruleId)
  if (rule.params.requireNames !== true) {
    context.skip(ruleId, '规则库未启用 requireNames：是否要求同时填写名称由本机构口径决定')
    return
  }
  const diagnoses = allDiagnoses(context.input)
  if (diagnoses.length === 0) {
    context.skip(ruleId, '材料中没有诊断记录')
    return
  }
  for (const { entry, role } of diagnoses) {
    if (entry.name !== undefined && entry.name.trim() !== '') continue
    context.add(
      ruleId,
      locatorOf(entry, role),
      `诊断编码「${entry.code}」没有对应的诊断名称`,
      '首页应当使用规范的疾病诊断名称，并同时填写名称及代码',
      '补填诊断名称',
    )
  }
}

/**
 * IC-011 — a T80-T88 principal diagnosis needs an additional code.
 *
 * This is the only "another code is required" clause that could be quoted
 * verbatim from a national document. The clause says an additional code is
 * needed; it does not say which one, so the check only asks whether any other
 * diagnosis is present at all and leaves the choice to the coder.
 */
function checkAdditionalCode(context: RuleContext): void {
  const ruleId = 'IC-011'
  const rule = ruleById(context.ruleset, ruleId)
  const articles = paramStrings(rule, 'articles', [])
  const entry = context.input.principalDiagnosis
  if (entry === undefined) {
    context.skip(ruleId, '材料未提供主要诊断')
    return
  }
  if (articles.length === 0) {
    context.skip(ruleId, '规则库未配置 articles：系列范围随目录版本变化，本条不执行')
    return
  }
  const bare = bareCode(entry.code).toUpperCase()
  const inSeries = articles.some((article) => bare.startsWith(article.toUpperCase()))
  if (!inSeries) {
    context.skip(ruleId, `主要诊断「${entry.code}」不在配置的 ${articles.join('/')} 系列内，本条不适用`)
    return
  }
  if (context.input.otherDiagnoses.length > 0) return
  context.add(
    ruleId,
    locatorOf(entry, 'principal'),
    `主要诊断「${entry.code}」属于 T80-T88 系列，但诊断列表中没有其他诊断`,
    '当该并发症被编在T80-T88系列时，需要另编码对该并发症进行说明',
    '补充说明该并发症的另编码；应为哪一条须由编码员按所用目录判断，本条不代为决定',
  )
}

/**
 * IC-012 — a chapter XVIII symptom code as principal diagnosis.
 *
 * The clause's prohibition is conditional ("when there is a related definite
 * diagnosis"), and deciding that is a clinical judgement, so the check narrows
 * itself to the two things it can see: the principal diagnosis sits in chapter
 * XVIII, and a non-chapter-XVIII diagnosis is also present. Either condition
 * missing means the check does not run.
 */
function checkSymptomPrincipal(context: RuleContext): void {
  const ruleId = 'IC-012'
  const rule = ruleById(context.ruleset, ruleId)
  const prefix = typeof rule.params.chapter18Prefix === 'string' ? rule.params.chapter18Prefix.toUpperCase() : 'R'
  const entry = context.input.principalDiagnosis
  if (entry === undefined) {
    context.skip(ruleId, '材料未提供主要诊断')
    return
  }
  const bare = bareCode(entry.code).toUpperCase()
  if (!bare.startsWith(prefix)) {
    context.skip(ruleId, `主要诊断「${entry.code}」不在 ICD-10 第十八章（${prefix}00-${prefix}99）范围内，本条不适用`)
    return
  }
  const definite = context.input.otherDiagnoses.filter((other) => !bareCode(other.code).toUpperCase().startsWith(prefix))
  if (definite.length === 0) {
    context.skip(
      ruleId,
      '诊断列表中没有第十八章以外的明确诊断，无法判断"存在相关明确诊断"这一前提，本条不执行',
    )
    return
  }
  context.add(
    ruleId,
    locatorOf(entry, 'principal'),
    `主要诊断「${entry.code}」属第十八章症状体征，而列表中另有明确诊断（${definite.map((other) => other.code).join('、')}）`,
    '当症状、体征和不确定情况有相关的明确诊断时，该诊断应作为主要诊断',
    '核对主要诊断的选择；出院时诊断仍不明确时，以症状作主要诊断是允许的，须由编码员判断',
  )
}

const CHECKERS: readonly ((context: RuleContext) => void)[] = [
  checkDiagnosisFormat,
  checkDuplicateCodes,
  checkAsteriskPairing,
  checkAsteriskRetired,
  checkPrincipalCorrespondence,
  checkAdmissionCondition,
  checkProcedureFormat,
  checkChiefComplaint,
  checkPrincipalPresent,
  checkDiagnosisNames,
  checkAdditionalCode,
  checkSymptomPrincipal,
]

/**
 * Run the whole rule pack against one coded episode.
 * @param input - normalized material.
 * @param ruleset - validated rule pack.
 * @param options - plugin identity, clock value and rule selection.
 * @returns the report, with `skipped` listing every check that did not run.
 */
export function runCheck(input: IcdInput, ruleset: Ruleset, options: CheckOptions): Report {
  const disabled = new Set([...ruleset.disabled, ...options.disabledRules])
  const only = new Set(options.onlyRules)
  const base = {
    input,
    ruleset,
    issues: [] as Issue[],
    skipped: [] as Skipped[],
    fired: new Set<string>(),
    skipReasons: new Map<string, string>(),
  }
  const context: RuleContext = {
    ...base,
    add: makeAdd(base),
    skip: (ruleId, reason) => {
      const existing = base.skipReasons.get(ruleId)
      base.skipReasons.set(ruleId, existing === undefined ? reason : `${existing}；${reason}`)
    },
  }

  for (const checker of CHECKERS) checker(context)

  const withNote = (reason: string): string => (options.skipNotes === undefined ? reason : `${reason}；${options.skipNotes}`)
  const skipped: Skipped[] = disabledAsSkipped(ruleset, [...disabled], withNote('该规则在当前配置中被禁用'))
  const already = new Set(skipped.map((entry) => entry.rule))
  for (const [ruleId, reason] of base.skipReasons) {
    if (already.has(ruleId)) continue
    if (disabled.has(ruleId) || (options.onlyRules.length > 0 && !only.has(ruleId))) continue
    skipped.push({ rule: ruleId, reason: withNote(reason) })
    already.add(ruleId)
  }
  for (const rule of ruleset.rules) {
    if (disabled.has(rule.id) || base.fired.has(rule.id) || already.has(rule.id)) continue
    if (options.onlyRules.length > 0 && !only.has(rule.id)) continue
    skipped.push({ rule: rule.id, reason: withNote('材料满足该检查的前置条件且未发现差异条目') })
  }
  if (options.onlyRules.length > 0) {
    const notSelected = ruleset.rules.filter((rule) => !only.has(rule.id) && !disabled.has(rule.id))
    if (notSelected.length > 0) {
      skipped.push({
        rule: notSelected.map((rule) => rule.id).join(','),
        reason: withNote(`本次调用通过 only 参数把执行范围限制为 ${[...only].join(', ')}，上列规则未执行`),
      })
    }
  }

  return makeReport({
    plugin: options.plugin,
    target: input.target,
    rulesetVersion: ruleset.version,
    checkedAt: options.checkedAt,
    issues: context.issues,
    skipped,
  })
}
