# dsh-icd-rule-check — Verificación de las reglas de codificación ICD de un episodio de hospitalización: avisos de código combinado y de emparejamiento daga/asterisco

[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-en.svg)](https://dsh.market/)

`dsh-icd-rule-check` lee un episodio de hospitalización codificado —el diagnóstico principal, los otros diagnósticos, el procedimiento principal, los otros procedimientos y los códigos de circunstancia de ingreso— y comprueba la estructura y las referencias internas de ese mismo episodio: que cada código de diagnóstico tenga forma ICD-10 y cada código de procedimiento forma ICD-9-CM-3 (los marcadores † / * se retiran antes de la comprobación de forma), que el mismo código de diagnóstico no se liste dos veces, que un código de asterisco tenga su código de daga pareja en el mismo episodio, que haya un diagnóstico principal y que estén rellenos los campos que cada comprobación necesita. Cada diferencia cita la cláusula de la que procede, y toda comprobación que no pudo ejecutarse figura en `skipped` en lugar de pasar en silencio. No busca ningún código en un catálogo.

## Cómo se ve la salida

![Terminal demo of dsh-icd-rule-check: real output over its IC-001 fixture](https://raw.githubusercontent.com/PerryLink/dsh-icd-rule-check/main/docs/assets/dsh-icd-rule-check-demo.png)

Salida real de este plugin sobre su propio fixture de prueba `IC-001` — no es un montaje. El paquete de reglas no inventa citas, así que cada hallazgo nombra la cláusula aplicada y advierte que su texto no se obtuvo.

## Qué responde

| Usted pregunta | Qué responde |
|---|---|
| La exportación guarda el código de diagnóstico como `A18.1†`. ¿La daga hará que salte la comprobación de forma? | No. `IC-001` retira los marcadores de daga y asterisco († / *) antes de examinar el código, así que el marcador por sí solo nunca produce una diferencia. Solo comprueba la forma del código: un código bien formado que su catálogo no contenga realmente pasa igualmente, porque verificarlo exige un catálogo licenciado de la misma versión que usa el codificador. |
| El campo del diagnóstico principal está vacío. ¿Qué se informa? | `IC-009` informa de que el registro no lleva diagnóstico principal e indica que hay que rellenarlo. Su límite: comprueba solo que el campo esté relleno, no que el diagnóstico elegido como principal sea el correcto; esa elección es del codificador y la regla no la hace. |
| Hay un código de asterisco en la lista y ningún código de daga que le corresponda. | `IC-003` informa del código de asterisco cuando el código de daga que le asigna la tabla de emparejamiento no aparece en el mismo episodio. Es la determinación más mecánica del paquete y necesita su propia tabla en `pairs`; con `pairs` vacío la regla informa de que no pudo ejecutarse en lugar de pasar en silencio. Su límite es el emparejamiento mismo: el paquete no adopta la lectura del ámbito chino del historial clínico según la cual un código de asterisco no puede ser el diagnóstico principal. |
| El mismo código de diagnóstico aparece listado dos veces. | `IC-002` informa del código repetido y lo trata como el mismo diagnóstico listado dos veces. Está limitada a `warn`: no se encontró ninguna cláusula que prohíba la repetición con esas palabras, así que su base es un principio y señala la fila para revisión en lugar de bloquear. |
| El diagnóstico principal es una complicación de la serie T82 y no hay ningún otro diagnóstico. | `IC-011` informa de esa fila. Con un diagnóstico principal en la serie T80-T88 solo pregunta si existe algún otro diagnóstico además del principal: la cláusula exige un código adicional que describa la complicación, pero no dice cuál, así que la regla no lo elige; eso corresponde al codificador y al catálogo en uso. |
| `IC-005` nunca informa de nada en nuestra exportación, ¿significa que el procedimiento principal concuerda con el diagnóstico principal? | No. `IC-005` se distribuye con su tabla `correspondence` vacía, de modo que se declara en `skipped` con el motivo de que la tabla no está configurada; una lista de diferencias vacía ahí no es un aprobado. Rellene `correspondence` con sus propias agrupaciones diagnóstico→procedimiento —una lista `procedures` vacía significa que ese grupo no debe llevar procedimiento principal— y la regla empieza a comparar. |

## Normas que sigue

| Documento | Número | Reglas que lo citan |
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

| Superficie | Estado |
|---|---|
| Harness | Rango de peers `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` — verificado para aceptar tanto `0.2.0-rc.2` como `0.2.1-alpha.1`. **No se declara `engines.dsh`**: no tiene lector y no puede rechazar ningún host |
| Node | `^22.19.0 || >=24.0.0` |
| Plataformas | Todas (ESM puro; sin código nativo, sin red, sin llamada al modelo) |
| Modo de herramienta | Funciona en `native`, `ptc` y `both`; para un directorio completo use `ptc` |

## What it does

La tabla de reglas, los campos y el comportamiento detallado están en [README.md](README.md#what-it-does) (versión principal en inglés). El plugin sólo enumera divergencias literales frente a las cláusulas citadas e indica en `skipped` cada comprobación que no pudo ejecutarse.

## Install

```sh
dsh plugin --profile <name> add dsh-icd-rule-check
dsh --profile <name> --dump-config | grep 'dsh-icd-rule-check'
```

## Configuration

Todos los parámetros ajustables viven en el esquema Schemastery de `src/config.ts`, por lo que se cambian desde `cordis.yml` sin tocar el código; los umbrales por regla están en el paquete de reglas bajo `rules/`.

| Clave | Tipo | Predeterminado | Descripción |
|---|---|---|---|
| `rulesFile` | string | `rules/icd-rule-check.yaml` | Ruta del paquete de reglas, relativa a la raíz del paquete |
| `disabledRules` | string[] | `[]` | Ids de reglas que se dejan de ejecutar; cada una aparece en `skipped` |
| `onlyRules` | string[] | `[]` | Ejecutar solo estas reglas; vacío ejecuta todas |
| `skipNotes` | string | `""` | Nota añadida a cada motivo de `skipped` |
| `timeoutMs` | number | `120000` | Presupuesto de tiempo de espera cooperativo de la herramienta |

## Material format

Acepta JSON o YAML. El ejemplo completo de campos está en [README.md](README.md#material-format) (versión principal en inglés). Los campos son opcionales en la capa de lectura y los valida el motor, de modo que una exportación parcial produce hallazgos sobre lo que falta en lugar de un fallo.

## Rule sources

Los datos de las reglas están separados del código: cada regla lleva documento, número, cláusula en la numeración propia de la fuente, extracto literal y URL de origen. El cargador impone que el extracto sea una cita real de al menos ocho caracteres y que una comprobación basada sólo en un principio general (`kind: derived-from-principle`, tope `warn`) o en una política local (`kind: institutional-configuration`, tope `info`) nunca se declare `error`.

Los límites verificados y las conclusiones deliberadamente **no** afirmadas están en [README.md](README.md#rule-sources) (versión principal en inglés) y en `rules/evidence/`.

## Troubleshooting

- **El plugin se instala pero la herramienta no aparece**: compruebe que `main` resuelve a `lib/index.mjs` y que `pnpm run build` lo generó.
- **`dsh plugin add` rechaza el paquete**: la faixa de peers cubre `0.1.x` y `0.2.x`; fuera de ella, conceda una exención explícita con `dsh plugin --profile <name> allow-version <pkg@ver> --dsh-version <runtime> --accept-risk`.
- **Una regla no se ejecutó**: lea el arreglo `skipped`.
- **`check` informa `manifest-peers` como fallo**: es un problema conocido de `dsh-plugin-dev`; el runtime aplica la compatibilidad al instalar.
- **Los horarios parecen desplazados**: toda la aritmética es de hora local sobre las cadenas entregadas.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
node ../scripts/sync-shared.mjs dsh-icd-rule-check
```

El último comando copia el kit compartido de `../_shared` a `src/shared/`; vuelva a ejecutarlo tras cada cambio compartido.

## License

[Apache License 2.0](LICENSE) © 2026 dsh-icd-rule-check contributors.
