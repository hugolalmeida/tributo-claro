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

## Imagens-base (Docker Hub, library)

- `eclipse-temurin` (OpenJDK, GPLv2 com Classpath Exception): JDK 21 só na etapa de build; JRE 21 alpine na execução do motor.
- `node:24-alpine`: execução do app.

O uso desses componentes não implica endosso, homologação ou chancela da Receita Federal do Brasil.
