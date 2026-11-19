# Avisos de terceiros

## calculadora-rtc-simples-nacional

- Origem: https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional
- Commit usado: `c5b0f01c8351c3f0d0795cc617b29d233e9f98df`
- Licença: MIT, Copyright (c) 2026 Receita Federal do Brasil

## calculadora-rtc-regime-regular (somente os scripts Flyway do banco de referência)

- Origem: https://github.com/ReceitaFederal/calculadora-rtc-regime-regular
- Commit usado: `150cccbe414d4a5edea703e4f7a424af5aa222c7`
- Licença: MIT, Copyright (c) 2026 Receita Federal do Brasil

Nenhum código desses projetos é copiado para este repositório. A imagem `motor/` os compila a partir da
fonte oficial e guarda o texto integral das licenças em `/motor/licencas/`.

As dependências Maven do motor têm licenças próprias. A montagem da imagem gera a lista delas
(`license-maven-plugin` 2.9.0, modo relatório, sem dependências de teste/provided) em
`/motor/licencas/THIRD-PARTY.txt`, e o CI guarda essa lista como artefato `licencas-motor`.
Dependência com licença GPL, LGPL ou AGPL precisa de avaliação antes do merge.

### Dependências com licença dupla: escolha da EPL-2.0

No relatório de 19/11/2026 (CI run 44596081003), as únicas dependências que citam GPL ou LGPL têm licença
dupla. Elas são usadas sob a **Eclipse Public License 2.0**, mantidos os avisos de copyright e de licença
(avaliado e aprovado pelo Cleber em 19/11/2026):

| Dependência | Versão | Licenças oferecidas | Usada sob |
|---|---|---|---|
| jakarta.transaction:jakarta.transaction-api | 2.0.1 | EPL 2.0 ou GPL2 com Classpath Exception | EPL-2.0 |
| jakarta.annotation:jakarta.annotation-api | 2.1.1 | EPL 2.0 ou GPL2 com Classpath Exception | EPL-2.0 |
| ch.qos.logback:logback-core | 1.5.34 | EPL-2.0 ou LGPL-2.1-only | EPL-2.0 |
| ch.qos.logback:logback-classic | 1.5.34 | EPL-2.0 ou LGPL-2.1-only | EPL-2.0 |

Ao atualizar o motor, confira de novo o relatório. Licença sem alternativa permissiva volta para avaliação.

## Imagens-base (Docker Hub, library)

- `eclipse-temurin` (OpenJDK, GPLv2 com Classpath Exception): JDK 21 só na etapa de build; JRE 21 alpine na execução do motor.
- `node:24-alpine`: execução do app.

O uso desses componentes não implica endosso, homologação ou chancela da Receita Federal do Brasil.
