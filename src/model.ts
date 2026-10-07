/**
 * Input contract for the ICD coding-rule checker.
 *
 * The material is one coded episode: a principal diagnosis, its secondary
 * diagnoses, and the procedures performed, each as a name-and-code pair. The
 * checker never looks anything up in a code catalogue — it works on the
 * structure of the codes it is given, because a catalogue lookup would need a
 * licensed code table whose version has to match the coder's, and a mismatch
 * there produces confident nonsense.
 */

/** One diagnosis or procedure entry. */
export interface CodedEntry {
  /** The code exactly as the coder wrote it. */
  code: string
  /** The name the coder attached to the code. */
  name?: string
  /** 1-based row in the source table, when the input was tabular. */
  row?: number
}

/** The whole normalized input. */
export interface IcdInput {
  target: string
  /** 主要诊断. */
  principalDiagnosis?: CodedEntry
  /** 其他诊断, in the order given. */
  otherDiagnoses: CodedEntry[]
  /** 主要手术操作. */
  principalProcedure?: CodedEntry
  /** 其他手术操作. */
  otherProcedures: CodedEntry[]
  /** 入院病情代码 per diagnosis, keyed by code, when the export carries it. */
  admissionCondition: Record<string, string>
  /** Free-form fields the material carried, for the presence checks. */
  fields: Record<string, string>
  warnings: string[]
}

/** True when the code carries the ICD-10 dagger marker. */
export function isDagger(code: string): boolean {
  return code.includes('†')
}

/** True when the code carries the ICD-10 asterisk marker. */
export function isAsterisk(code: string): boolean {
  return code.includes('*')
}

/** Strip the dagger/asterisk markers, leaving the bare code. */
export function bareCode(code: string): string {
  return code.replace(/[†*]/g, '').trim()
}
