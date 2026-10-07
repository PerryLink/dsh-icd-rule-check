/**
 * Reader for the canonical ICD coding material.
 *
 * The material is JSON or YAML. Every field is optional at the reader level and
 * validated by the check engine, so a partial export produces findings about the
 * missing parts instead of a reader crash.
 */

import { YamlSubsetError, parseYaml } from './shared/yaml.ts'
import type { CodedEntry, IcdInput } from './model.ts'

/** Raised when the material cannot be read at all. */
export class MaterialError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MaterialError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value.trim() === '' ? undefined : value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

/** Read one entry, accepting either `{ code, name }` or a bare code string. */
function parseEntry(value: unknown, where: string): CodedEntry {
  if (typeof value === 'string') {
    const code = text(value)
    if (code === undefined) throw new MaterialError(`${where} 的编码为空`)
    return { code }
  }
  if (!isRecord(value)) throw new MaterialError(`${where} 必须是映射或字符串`)
  const code = text(value.code ?? value.icd ?? value.value)
  if (code === undefined) throw new MaterialError(`${where} 缺少必填字段 code`)
  const entry: CodedEntry = { code }
  const name = text(value.name ?? value.label)
  if (name !== undefined) entry.name = name
  const row = text(value.row)
  if (row !== undefined && /^\d+$/.test(row)) entry.row = Number.parseInt(row, 10)
  return entry
}

/** Read a list of entries, tolerating a missing list. */
function parseList(value: unknown, where: string): CodedEntry[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new MaterialError(`${where} 必须是列表`)
  return value.map((entry, index) => parseEntry(entry, `${where}[${index}]`))
}

/**
 * Parse material into the normalized input contract.
 * @param source - JSON or YAML text.
 * @param target - description of where the material came from.
 * @returns the normalized input.
 */
export function parseMaterial(source: string, target: string): IcdInput {
  const trimmed = source.trim()
  if (trimmed === '') throw new MaterialError('材料为空')
  let document: unknown
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      document = JSON.parse(trimmed)
    } catch (error) {
      throw new MaterialError(`JSON 无法解析：${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    try {
      document = parseYaml(trimmed)
    } catch (error) {
      if (error instanceof YamlSubsetError) throw new MaterialError(`YAML 无法解析：${error.message}`)
      throw error
    }
  }
  if (!isRecord(document)) throw new MaterialError('材料根节点必须是映射')

  const warnings: string[] = []
  const input: IcdInput = {
    target,
    otherDiagnoses: parseList(document.otherDiagnoses ?? document.otherDiagnosis, 'otherDiagnoses'),
    otherProcedures: parseList(document.otherProcedures ?? document.otherProcedure, 'otherProcedures'),
    admissionCondition: {},
    fields: {},
    warnings,
  }

  const principal = document.principalDiagnosis ?? document.mainDiagnosis
  if (principal !== undefined && principal !== null) {
    input.principalDiagnosis = parseEntry(principal, 'principalDiagnosis')
  }
  const procedure = document.principalProcedure ?? document.mainProcedure
  if (procedure !== undefined && procedure !== null) {
    input.principalProcedure = parseEntry(procedure, 'principalProcedure')
  }

  if (isRecord(document.admissionCondition)) {
    for (const [key, value] of Object.entries(document.admissionCondition)) {
      const rendered = text(value)
      if (rendered !== undefined) input.admissionCondition[key] = rendered
    }
  }

  for (const key of ['chiefComplaint', 'admissionDiagnosis', 'dischargeDiagnosis', 'note'] as const) {
    const value = text(document[key])
    if (value !== undefined) input.fields[key] = value
  }

  const total =
    (input.principalDiagnosis === undefined ? 0 : 1) +
    input.otherDiagnoses.length +
    (input.principalProcedure === undefined ? 0 : 1) +
    input.otherProcedures.length
  if (total === 0) {
    throw new MaterialError(
      '材料中没有 principalDiagnosis、otherDiagnoses、principalProcedure 或 otherProcedures 任何一项，无法执行检查',
    )
  }

  return input
}
