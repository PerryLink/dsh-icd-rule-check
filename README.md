# dsh-icd-rule-check

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

| Surface | Status |
|---|---|
| Harness | Peer range `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` — verified to accept both `0.2.0-rc.2` and `0.2.1-alpha.1`. `engines.dsh` is deliberately not declared: it has no reader and cannot reject a host |
| Node | `^22.19.0 || >=24.0.0` |
| Platforms | All (plain ESM; no native code, no network, no model call) |
| Tool mode | Works in `native`, `ptc` and `both`; for a batch of records use `ptc` |

## What it does

Registers the `icd_rule_check` tool. It reads one coded episode — principal diagnosis, other
diagnoses, principal procedure, other procedures — applies a versioned rule pack, and returns a report
whose every finding names the clause it came from.

| Rule | Check | Severity | Basis kind |
|---|---|---|---|
| `IC-001` | every diagnosis code has ICD-10 form (markers stripped first) | error | direct |
| `IC-002` | the same diagnosis code is not listed twice | warn | principle |
| `IC-003` | an asterisk code has its dagger partner in the same episode | warn | principle |
| `IC-004` | a diagnosis still uses the asterisk form (switch, off by default) | info | local |
| `IC-005` | the principal procedure groups with the principal diagnosis (table, off by default) | warn | principle |
| `IC-006` | a diagnosis flagged "not present on admission" is not the principal diagnosis | warn | principle |
| `IC-007` | every procedure code has ICD-9-CM-3 form | error | direct |
| `IC-008` | the chief complaint and the diagnosis names share a literal fragment | info | principle |
| `IC-009` | a principal diagnosis is present | error | direct |
| `IC-010` | diagnoses carry names, not only codes (switch, off by default) | info | local |

Every switch that depends on a code catalogue is **off** by default and reports itself in `skipped`
until configured, so an unfilled table can never read as "nothing wrong".

## Install

```sh
pnpm pack
dsh plugin --profile <name> add ./dsh-icd-rule-check-0.1.0.tgz
dsh --profile <name> --dump-config | grep 'dsh-icd-rule-check'
```

## Configuration

| Key | Type | Default | Description |
|---|---|---|---|
| `rulesFile` | string | `rules/icd-rule-check.yaml` | Rule-pack path, relative to the package root |
| `disabledRules` | string[] | `[]` | Rule ids to stop running; each appears in `skipped` |
| `onlyRules` | string[] | `[]` | Run only these rule ids; empty runs every rule |
| `skipNotes` | string | `""` | Note appended to every `skipped` reason |
| `timeoutMs` | number | `120000` | Cooperative tool timeout budget |

Rule-level parameters worth knowing:

- `IC-003` `pairs` — your dagger↔asterisk table, as `[{ dagger, asterisk }]`. Empty means the check
  cannot run and says so.
- `IC-005` `correspondence` — your diagnosis→procedure groupings, as
  `[{ diagnosis: [I21], procedures: [36.06, 36.07] }]`. An empty `procedures` list means "this group
  should carry no principal procedure".
- `IC-004` `flagAsteriskUse` and `IC-010` `requireNames` — off until you enable them for your
  catalogue and reporting rules.
- `IC-006` `flagCode` — the admission-condition code that means "not present on admission". Defaults to
  `4`.

## Material format

The tool accepts JSON or YAML. Every field is optional at the reader level and validated by the check
engine, so a partial export produces findings about the missing parts instead of a crash.

```yaml
principalDiagnosis: { code: "I21.900", name: 急性心肌梗死 }
otherDiagnoses:
  - { code: "I10", name: 高血压 }
principalProcedure: { code: "36.0600", name: 冠状动脉支架植入术 }
otherProcedures: []
chiefComplaint: 突发心肌梗死样胸痛 3 小时
admissionCondition:
  "I21.900": "1"     # drives IC-006
```

An entry may also be a bare code string (`principalDiagnosis: I21.900`), and a diagnosis or procedure
may carry the ICD-10 markers (`A18.1†`, `N51.0*`) — they are stripped before the format check, so a
marker never trips `IC-001`.

## Rule sources

Rule data lives in `rules/icd-rule-check.yaml`. Every rule carries a document, a document number, a
clause in the source's own numbering, a verbatim excerpt and the URL the excerpt was read from. The
loader enforces that an excerpt is a real quotation of at least eight characters, and that a check
resting only on a general principle or a local policy can never be declared `error`.

The clauses that are quoted come from 《住院病案首页数据填写质量规范（暂行）》 and
《住院病案首页数据质量管理与控制指标（2016版）》（国卫办医发〔2016〕24号） and from
《医疗保障基金结算清单填写规范（试行）》（医保办发〔2020〕20号）. Two research findings shaped the
pack and are recorded in it:

1. **No quotable clause was found for combined coding**, so no combined-code rule exists here. The
   honest output of that investigation is a parameterised hook that is empty by default, not a rule
   with an invented clause number.
2. **The asterisk form's standing depends on the catalogue version.** The national clinical version and
   the insurance version treat it differently, so `IC-004` is a switch rather than a rule.

## Troubleshooting

- **`IC-003` or `IC-005` reports itself as skipped.** The table they need is empty. Fill in `pairs` or
  `correspondence` with the version your encoders use.
- **A code you know is valid is reported as malformed.** `IC-001` checks form only; if your catalogue
  uses a spelling outside `^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$`, change the pattern in the rule pack.
- **`IC-008` fires on a clinically sensible record.** It compares a chief complaint against diagnosis
  *names* by literal fragment, which is a string operation, not a coding judgement. Add the name you use
  or disable the rule.
- **The plugin installs but the tool never appears.** Check that `main` resolves to `lib/index.mjs` and
  that `pnpm run build` produced it; a wrong `main` makes the loader skip the entry silently.
- **`dsh plugin add` refuses the package as incompatible.** The peer range covers `0.1.x` and `0.2.x`;
  if your runtime sits outside it, grant an explicit exemption:
  `dsh plugin --profile <name> allow-version dsh-icd-rule-check@0.1.0 --dsh-version <runtime> --accept-risk`
- **`check` reports `manifest-peers` as failed.** The static checker compares against a hard-coded peer
  range that predates the 0.2 line. The runtime enforces peer compatibility at install time, so the
  declared range is the correct one; this is a known upstream issue in `dsh-plugin-dev`.

## Development

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit
pnpm test            # vitest, paired fixtures per rule
pnpm run build       # tsdown -> lib/index.mjs + lib/index.d.mts
node ../scripts/sync-shared.mjs dsh-icd-rule-check   # refresh src/shared from ../_shared
```

## License

[Apache License 2.0](LICENSE) © 2026 dsh-icd-rule-check contributors.
