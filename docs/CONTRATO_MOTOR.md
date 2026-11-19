# Contrato do motor do Simples Nacional

Lido do código-fonte de `calculadora-rtc-simples-nacional`, commit `c5b0f01c8351c3f0d0795cc617b29d233e9f98df`
(19/11/2026). Ao trocar o commit em `motor/Dockerfile`, confira de novo os arquivos citados aqui.

Atenção: `docs/exemplos.md` desse repositório mostra exemplos do **Regime Regular** (`/regime-geral`,
`aliquotasNominais`). Não servem para o Simples Nacional.

## Cálculo

`POST /api/calculadora/observabilidade/simples-nacional` (porta 8082, perfil `offline`)

Fonte: `api/simplesnacional/controller/SimplesNacionalController.java`, `model/input/OperacaoSimplesInput.java`,
`model/input/ItemSimplesInput.java`.

| Campo | Uso no Tributo Claro |
|---|---|
| `id` | aleatório, 24 caracteres hexadecimais (obrigatório) |
| `versao` | `"2.0.0"` (obrigatório; exemplo do OpenAPI) |
| `data` | data do fato gerador, `AAAA-MM-DD` |
| `tpDoc` | `55` (NF-e) ou `65` (NFC-e), os suportados na carga atual |
| `CRT` / `tpRegimeIBSCBS` | só as combinações que calculam: `CRT=1`; `CRT=2`; `CRT=3` + `tpRegimeIBSCBS=2` |
| `tpEnteGov` | opcional, 1 a 4 (compra governamental; vale para a operação inteira) |
| `itens[].numero` | sequencial a partir de 1 |
| `itens[].cAtivSN` | opcional; ausente ou inválido gera `NAO_CALCULADO` (não é erro) |
| `itens[].cClassTrib` | obrigatório, 6 dígitos |
| `itens[].baseCalculo` | texto decimal, sem o Imposto Seletivo |
| `itens[].valorImpostoSeletivo` | texto decimal, `"0.00"` quando não há |
| `itens[].pIBSSN` / `pCBSSN` | alíquotas efetivas do Simples, em pontos percentuais; exigidas só quando o cálculo as usa |

Erros na operação como um todo (data, escopo do regime, itens vazios) voltam como **HTTP 422** com
`errors[]` (`code`, `title`, `pointer`, `detail`). O Tributo Claro repassa só esses quatro campos.

Resposta 200 (`model/output/ObservabilidadeSimplesDomain.java`):

- `oper`: repasse da operação.
- `objetos[]`: `nObj`, `estadoItem`, `tribCalc` (`vRBSNitem`, `tpRBSN`, `tpRBSNDescricao`, `vBC`, `pIBSSN`, `vIBSSN`,
  `vIBSPendSusp`, `pCBSSN`, `vCBSSN`, `vCBSPendSusp`, `IS.valor`, `totalItem`) e `erros[]`.
- `total`: `vRBSNtot`, `vBC`, `vIBSSNtot`, `vIBSSNtotPendSusp`, `vCBSSNtot`, `vCBSSNtotPendSusp`, `totalIs`, `totalTributos`.
- Cabeçalhos: `X-CALC-APP-VERSION` e `X-CALC-DB-VERSION`.

Estados do item (`enumeration/EstadoItemSimplesEnum.java`): `CALCULADO`, `NAO_CALCULADO`, `NAO_IMPLEMENTADO`,
`INCONSISTENCIA_ENTRADA`, `FALHA_TECNICA`. Qualquer outro estado é exibido como "não reconhecido" e tratado como não calculado.

## Atividades

`GET /api/calculadora/simples-nacional/atividades?data=AAAA-MM-DD[&tpDoc=55]`
(`api/atividadesimples/controller/AtividadeSimplesController.java`). O Tributo Claro usa `codigo`, `descricao`,
`rotuloCurtoAnexo` e `admissivelNoDocumento`.

## Banco de referência

O motor não traz o banco. Ele é gerado com `mvnw flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf`,
a partir da pasta `flyway/` do repositório `calculadora-rtc-regime-regular` (ADR001 e ADR009 do motor).
O `motor/Dockerfile` faz isso na montagem da imagem.
