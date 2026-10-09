# dsh-icd-rule-check — Verificação das regras de codificação ICD de um episódio de internamento: avisos de código combinado e de emparelhamento punhal/asterisco

[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-en.svg)](https://dsh.market/)

`dsh-icd-rule-check` lê um episódio de internamento codificado —o diagnóstico principal, os outros diagnósticos, o procedimento principal, os outros procedimentos e os códigos de circunstância de admissão— e verifica a estrutura e as referências internas desse mesmo episódio: se cada código de diagnóstico tem forma ICD-10 e cada código de procedimento forma ICD-9-CM-3 (os marcadores † / * são retirados antes da verificação de forma), se o mesmo código de diagnóstico não é listado duas vezes, se um código de asterisco tem o seu código de punhal par no mesmo episódio, se existe um diagnóstico principal e se estão preenchidos os campos de que cada verificação precisa. Cada diferença cita a cláusula de onde vem, e toda a verificação que não pôde ser executada consta em `skipped` em vez de passar em silêncio. Não procura nenhum código num catálogo.

## Como é a saída

![Terminal demo of dsh-icd-rule-check: real output over its IC-001 fixture](https://raw.githubusercontent.com/PerryLink/dsh-icd-rule-check/main/docs/assets/dsh-icd-rule-check-demo.png)

Saída real deste plugin sobre o seu próprio fixture de teste `IC-001` — não é uma simulação. O pacote de regras não inventa citações, por isso cada achado nomeia a cláusula aplicada e avisa que o seu texto não foi obtido.

## O que ele responde

| Você pergunta | O que ele responde |
|---|---|
| A exportação guarda o código de diagnóstico como `A18.1†`. O punhal vai fazer disparar a verificação de forma? | Não. `IC-001` retira os marcadores de punhal e asterisco († / *) antes de examinar o código, por isso o marcador sozinho nunca produz uma diferença. Verifica apenas a forma do código: um código bem formado que o seu catálogo não contenha realmente passa à mesma, porque verificar isso exige um catálogo licenciado da mesma versão que o codificador usa. |
| O campo do diagnóstico principal está vazio. O que é reportado? | `IC-009` reporta que o registo não traz diagnóstico principal e indica que é preciso preenchê-lo. O seu limite: verifica apenas que o campo está preenchido, não que o diagnóstico escolhido como principal seja o correto; essa escolha é do codificador e a regra não a faz. |
| Há um código de asterisco na lista e nenhum código de punhal correspondente. | `IC-003` reporta o código de asterisco quando o código de punhal que a tabela de emparelhamento lhe atribui não aparece no mesmo episódio. É a determinação mais mecânica do pacote e precisa da sua própria tabela em `pairs`; com `pairs` vazio a regra reporta que não pôde ser executada em vez de passar em silêncio. O seu limite é o próprio emparelhamento: o pacote não adota a leitura do meio chinês do registo clínico segundo a qual um código de asterisco não pode ser o diagnóstico principal. |
| O mesmo código de diagnóstico aparece listado duas vezes. | `IC-002` reporta o código repetido e trata-o como o mesmo diagnóstico listado duas vezes. Está limitada a `warn`: não foi encontrada nenhuma cláusula que proíba a repetição com essas palavras, por isso a sua base é um princípio e assinala a linha para revisão em vez de bloquear. |
| O diagnóstico principal é uma complicação da série T82 e não há mais nenhum diagnóstico. | `IC-011` reporta essa linha. Com um diagnóstico principal na série T80-T88 pergunta apenas se existe algum outro diagnóstico além do principal: a cláusula exige um código adicional que descreva a complicação, mas não diz qual, por isso a regra não o escolhe; isso pertence ao codificador e ao catálogo em uso. |
| O `IC-005` nunca reporta nada na nossa exportação — isso significa que o procedimento principal corresponde ao diagnóstico principal? | Não. O `IC-005` é distribuído com a sua tabela `correspondence` vazia, pelo que se declara em `skipped` com o motivo de a tabela não estar configurada; uma lista de diferenças vazia aí não é uma aprovação. Preencha `correspondence` com os seus próprios agrupamentos diagnóstico→procedimento —uma lista `procedures` vazia significa que esse grupo não deve ter procedimento principal— e a regra começa a comparar. |

## Normas que segue

| Documento | Número | Regras que o citam |
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

| Superfície | Estado |
|---|---|
| Harness | Faixa de peers `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` — verificada para aceitar tanto `0.2.0-rc.2` quanto `0.2.1-alpha.1`. **`engines.dsh` não é declarado**: não tem leitor e não pode recusar nenhum host |
| Node | `^22.19.0 || >=24.0.0` |
| Plataformas | Todas (ESM puro; sem código nativo, sem rede, sem chamada ao modelo) |
| Modo de ferramenta | Funciona em `native`, `ptc` e `both`; para um diretório inteiro use `ptc` |

## What it does

A tabela de regras, os campos e o comportamento detalhado estão em [README.md](README.md#what-it-does) (versão principal em inglês). O plugin apenas lista divergências literais frente às cláusulas citadas e indica em `skipped` cada verificação que não pôde ser executada.

## Install

```sh
dsh plugin --profile <name> add dsh-icd-rule-check
dsh --profile <name> --dump-config | grep 'dsh-icd-rule-check'
```

## Configuration

Todos os parâmetros ajustáveis ficam no esquema Schemastery de `src/config.ts`, portanto mudam pelo `cordis.yml` sem editar código; os limites por regra ficam no pacote de regras sob `rules/`.

| Chave | Tipo | Padrão | Descrição |
|---|---|---|---|
| `rulesFile` | string | `rules/icd-rule-check.yaml` | Caminho do pacote de regras, relativo à raiz do pacote |
| `disabledRules` | string[] | `[]` | Ids de regras a desativar; cada uma aparece em `skipped` |
| `onlyRules` | string[] | `[]` | Executar apenas estas regras; vazio executa todas |
| `skipNotes` | string | `""` | Nota acrescentada a cada motivo de `skipped` |
| `timeoutMs` | number | `120000` | Orçamento de tempo limite cooperativo da ferramenta |

## Material format

Aceita JSON ou YAML. O exemplo completo de campos está em [README.md](README.md#material-format) (versão principal em inglês). Os campos são opcionais na camada de leitura e validados pelo motor, de modo que uma exportação parcial gera achados sobre o que falta em vez de falhar.

## Rule sources

Os dados das regras ficam separados do código: cada regra traz documento, número, cláusula na numeração própria da fonte, trecho literal e URL de origem. O carregador impõe que o trecho seja citação real de pelo menos oito caracteres e que uma verificação baseada apenas em princípio geral (`kind: derived-from-principle`, teto `warn`) ou em política local (`kind: institutional-configuration`, teto `info`) nunca seja declarada `error`.

Os limites verificados e as conclusões deliberadamente **não** afirmadas estão em [README.md](README.md#rule-sources) (versão principal em inglês) e em `rules/evidence/`.

## Troubleshooting

- **O plugin instala mas a ferramenta não aparece**: confirme que `main` resolve para `lib/index.mjs` e que `pnpm run build` o gerou.
- **`dsh plugin add` recusa o pacote**: a faixa de peers cobre `0.1.x` e `0.2.x`; fora dela, conceda isenção explícita com `dsh plugin --profile <name> allow-version <pkg@ver> --dsh-version <runtime> --accept-risk`.
- **Uma regra não executou**: leia o arranjo `skipped`.
- **`check` informa `manifest-peers` como falha**: problema conhecido do `dsh-plugin-dev`; o runtime aplica a compatibilidade na instalação.
- **Os horários parecem deslocados**: toda a aritmética é de hora local sobre as cadeias fornecidas.

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
node ../scripts/sync-shared.mjs dsh-icd-rule-check
```

O último comando copia o kit compartilhado de `../_shared` para `src/shared/`; execute-o novamente após cada alteração compartilhada.

## License

[Apache License 2.0](LICENSE) © 2026 dsh-icd-rule-check contributors.
