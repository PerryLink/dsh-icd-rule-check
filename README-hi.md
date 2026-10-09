# dsh-icd-rule-check — एक कूटबद्ध इनपेशेंट प्रकरण के ICD कोडिंग नियमों की जाँच: संयुक्त कोड तथा डैगर/एस्टरिस्क युग्मन की सूचना

[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-en.svg)](https://dsh.market/)

`dsh-icd-rule-check` एक कूटबद्ध इनपेशेंट प्रकरण पढ़ता है — मुख्य निदान, अन्य निदान, मुख्य शल्य-प्रक्रिया, अन्य शल्य-प्रक्रियाएँ और प्रवेश-स्थिति (admission condition) कूट — और उसी प्रकरण की संरचना तथा आंतरिक संबंधों की जाँच करता है: क्या प्रत्येक निदान कूट ICD-10 रूप में है और प्रत्येक शल्य-प्रक्रिया कूट ICD-9-CM-3 रूप में (रूप-जाँच से पहले † / * चिह्न हटा दिए जाते हैं), क्या वही निदान कूट दो बार सूचीबद्ध नहीं है, क्या किसी एस्टरिस्क कूट का उसका डैगर साथी उसी प्रकरण में मौजूद है, क्या मुख्य निदान भरा गया है, और प्रत्येक जाँच के लिए आवश्यक क्षेत्र भरे हैं या नहीं। प्रत्येक अंतर के साथ उसका आधार-खंड दर्ज होता है, और जो जाँच चल नहीं सकी वह चुपचाप पास होने के बजाय `skipped` में दर्ज होती है। यह किसी कूट-सूची में कूट नहीं खोजता।

## आउटपुट कैसा दिखता है

![Terminal demo of dsh-icd-rule-check: real output over its IC-001 fixture](https://raw.githubusercontent.com/PerryLink/dsh-icd-rule-check/main/docs/assets/dsh-icd-rule-check-demo.png)

इस प्लगइन का अपने ही `IC-001` टेस्ट फ़िक्स्चर पर वास्तविक आउटपुट — कोई नकली चित्र नहीं। नियम-पैक उद्धरण नहीं गढ़ता, इसलिए हर निष्कर्ष लागू किए गए खंड का नाम और यह भी बताता है कि उसका मूल पाठ इस बार प्राप्त नहीं हुआ।

## यह किन सवालों का जवाब देता है

| आपका सवाल | इसका जवाब |
|---|---|
| हमारे निर्यात में निदान कूट `A18.1†` लिखा है। क्या डैगर के कारण रूप-जाँच बज उठेगी? | नहीं। `IC-001` कूट की जाँच से पहले डैगर और एस्टरिस्क चिह्न († / *) हटा देता है, इसलिए अकेला चिह्न कभी अंतर दर्ज नहीं करता। यह केवल कूट का रूप देखता है: रूप में सही किंतु आपकी सूची में वास्तव में अनुपस्थित कूट भी पास हो जाता है, क्योंकि उसकी पुष्टि के लिए कोडर के समान संस्करण वाली अधिकृत कूट-सूची चाहिए। |
| मुख्य निदान का क्षेत्र खाली है। क्या बताया जाता है? | `IC-009` दर्ज करता है कि रिकॉर्ड में मुख्य निदान नहीं है, और उसे भरने का संकेत देता है। इसकी सीमा: यह केवल देखता है कि क्षेत्र भरा है या नहीं, यह नहीं कि मुख्य निदान के रूप में चुना गया निदान सही है — वह चयन कोडर का निर्णय है, नियम उसे नहीं करता। |
| सूची में एक एस्टरिस्क कूट है और उसके साथ कोई डैगर कूट नहीं है। | `IC-003` उस एस्टरिस्क कूट को दर्ज करता है जिसके लिए युग्मन-सारणी द्वारा निर्धारित डैगर कूट उसी प्रकरण में नहीं मिलता। यह इस नियम-संग्रह का सबसे यांत्रिक निर्णय है और इसके लिए `pairs` में आपकी अपनी सारणी चाहिए; `pairs` खाली रहने पर यह नियम चुपचाप पास होने के बजाय बताता है कि वह चल नहीं सका। इसकी सीमा स्वयं युग्मन है: चीनी मेडिकल-रिकॉर्ड व्यवहार की यह व्याख्या कि एस्टरिस्क कूट मुख्य निदान नहीं हो सकता, यह नियम-संग्रह स्वीकार नहीं करता। |
| वही निदान कूट दो बार सूचीबद्ध है। | `IC-002` दोहराए गए कूट को दर्ज करता है और उसे यही मानता है कि वही निदान दो बार सूचीबद्ध हुआ है। यह `warn` तक सीमित है: ऐसा कोई स्पष्ट खंड नहीं मिला जो इन शब्दों में दोहराव मना करे, इसलिए इसका आधार सैद्धांतिक है और यह पंक्ति को रोकने के बजाय समीक्षा के लिए चिह्नित करता है। |
| मुख्य निदान T82 श्रेणी की जटिलता है और कोई अन्य निदान सूचीबद्ध नहीं है। | `IC-011` उस पंक्ति को दर्ज करता है। मुख्य निदान T80-T88 श्रेणी में होने पर यह केवल यह देखता है कि मुख्य निदान के अतिरिक्त कोई अन्य निदान है या नहीं: खंड जटिलता के विवरण के लिए अतिरिक्त कूट की अपेक्षा करता है, पर यह नहीं बताता कि कौन-सा, इसलिए नियम उसे नहीं चुनता — वह कोडर और प्रयुक्त कूट-सूची का काम है। |
| हमारे निर्यात पर `IC-005` कभी कुछ दर्ज नहीं करता — क्या इसका अर्थ है कि मुख्य शल्य-प्रक्रिया मुख्य निदान से मेल खाती है? | नहीं। `IC-005` अपनी `correspondence` सारणी खाली लेकर आता है, इसलिए वह `skipped` में दर्ज होता है कि सारणी कॉन्फ़िगर नहीं है; वहाँ खाली परिणाम पास होना नहीं है। `correspondence` में अपने संस्थान के निदान→प्रक्रिया समूह भरें — खाली `procedures` सूची का अर्थ है कि उस समूह में कोई मुख्य शल्य-प्रक्रिया नहीं होनी चाहिए — तब यह नियम तुलना शुरू करता है। |

## यह किन मानकों पर आधारित है

| दस्तावेज़ | संख्यांक | इन्हें उद्धृत करने वाले नियम |
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

| सतह | स्थिति |
|---|---|
| Harness | peer रेंज `>=0.1.2-rc.1 <0.2.0 \|\| >=0.2.0-0 <0.3.0` — `0.2.0-rc.2` और `0.2.1-alpha.1` दोनों को स्वीकार करने के लिए सत्यापित। **`engines.dsh` जानबूझकर घोषित नहीं**: इसका कोई पाठक नहीं और यह किसी होस्ट को अस्वीकार नहीं कर सकता |
| Node | `^22.19.0 || >=24.0.0` |
| प्लेटफ़ॉर्म | सभी (शुद्ध ESM; कोई नेटिव कोड नहीं, कोई नेटवर्क नहीं, कोई मॉडल कॉल नहीं) |
| टूल मोड | `native`, `ptc` और `both` में काम करता है; पूरे फ़ोल्डर के लिए `ptc` चुनें |

## What it does

नियम-सूची, फ़ील्ड और विस्तृत व्यवहार [README.md](README.md#what-it-does) (अंग्रेज़ी मुख्य संस्करण) में हैं। यह प्लगइन केवल उद्धृत धाराओं के सामने शाब्दिक अंतर सूचीबद्ध करता है और हर न चल पाई जाँच को `skipped` में बताता है।

## Install

```sh
dsh plugin --profile <name> add dsh-icd-rule-check
dsh --profile <name> --dump-config | grep 'dsh-icd-rule-check'
```

## Configuration

सभी समायोज्य पैरामीटर `src/config.ts` की Schemastery स्कीमा में हैं, इसलिए कोड बदले बिना `cordis.yml` से बदले जा सकते हैं; प्रति-नियम सीमाएँ `rules/` के नियम-पैक में हैं।

| कुंजी | प्रकार | डिफ़ॉल्ट | विवरण |
|---|---|---|---|
| `rulesFile` | string | `rules/icd-rule-check.yaml` | नियम-पैक का पथ, पैकेज रूट के सापेक्ष |
| `disabledRules` | string[] | `[]` | बंद करने वाले नियम id; प्रत्येक `skipped` में दिखता है |
| `onlyRules` | string[] | `[]` | केवल ये नियम चलाएँ; खाली होने पर सभी नियम चलते हैं |
| `skipNotes` | string | `""` | हर `skipped` कारण के आगे जोड़ी जाने वाली टिप्पणी |
| `timeoutMs` | number | `120000` | उपकरण का सहकारी समय-सीमा बजट |

## Material format

JSON या YAML स्वीकार्य है। पूरा फ़ील्ड उदाहरण [README.md](README.md#material-format) (अंग्रेज़ी मुख्य संस्करण) में है। पढ़ने की परत में फ़ील्ड वैकल्पिक हैं और जाँच इंजन उन्हें सत्यापित करता है, इसलिए आंशिक निर्यात पर क्रैश के बजाय "अनुपस्थित" श्रेणी के निष्कर्ष मिलते हैं।

## Rule sources

नियम-डेटा कोड से अलग है: प्रत्येक नियम में दस्तावेज़, संख्या, स्रोत की अपनी क्रमांकन-प्रणाली के अनुसार धारा, शब्दशः उद्धरण और स्रोत URL होता है। लोडर लागू करता है कि उद्धरण कम से कम आठ अक्षरों का वास्तविक उद्धरण हो, और जिस जाँच का आधार केवल सामान्य सिद्धांत (`kind: derived-from-principle`, अधिकतम `warn`) या स्थानीय नीति (`kind: institutional-configuration`, अधिकतम `info`) हो, उसे कभी `error` घोषित न किया जाए।

सत्यापित सीमाएँ और जान-बूझकर **न** कहे गए निष्कर्ष [README.md](README.md#rule-sources) (अंग्रेज़ी मुख्य संस्करण) और `rules/evidence/` में हैं।

## Troubleshooting

- **प्लगइन इंस्टॉल हो गया पर टूल दिखता नहीं**: जाँचें कि `main` `lib/index.mjs` पर जाता है और `pnpm run build` ने उसे बनाया है।
- **`dsh plugin add` असंगत बताकर मना करता है**: peer range `0.1.x` और `0.2.x` दोनों को कवर करती है; बाहर होने पर स्पष्ट छूट दें: `dsh plugin --profile <name> allow-version <pkg@ver> --dsh-version <runtime> --accept-risk`।
- **कोई नियम नहीं चला**: `skipped` सरणी देखें।
- **`check` में `manifest-peers` विफल दिखता है**: यह `dsh-plugin-dev` की ज्ञात अपस्ट्रीम समस्या है; रनटाइम इंस्टॉल के समय अनुकूलता लागू करता है।
- **समय खिसका हुआ लगता है**: सारी गणना दिए गए स्ट्रिंग पर वॉल-क्लॉक है।

## Development

```sh
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
node ../scripts/sync-shared.mjs dsh-icd-rule-check
```

अंतिम कमांड `../_shared` का साझा किट `src/shared/` में कॉपी करता है; हर साझा बदलाव के बाद इसे दोबारा चलाएँ।

## License

[Apache License 2.0](LICENSE) © 2026 dsh-icd-rule-check contributors.
