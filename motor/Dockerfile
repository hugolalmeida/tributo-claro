# Motor de cálculo: calculadora-rtc-simples-nacional (Receita Federal do Brasil, licença MIT).
# Compila o código oficial num commit fixado e gera o banco SQLite de referência
# com os scripts Flyway do repositório calculadora-rtc-regime-regular (ADR001/ADR009
# do motor). Nada do código do motor é copiado para este repositório.
#
# Para atualizar o motor: troque os dois commits abaixo, leia o changelog/contrato
# e rode de novo os testes e o CI (simulação com o motor real).

FROM eclipse-temurin:21-jdk-noble@sha256:a2e61ec9e2e4d5c7aa885412400319f9299abe4d8189f42ec3bec48708c576a6 AS build

# calculadora-rtc-simples-nacional, commit de 27/10/2026
ARG SN_COMMIT=c5b0f01c8351c3f0d0795cc617b29d233e9f98df
# calculadora-rtc-regime-regular (scripts Flyway do banco), commit de 22/10/2026
ARG RR_COMMIT=150cccbe414d4a5edea703e4f7a424af5aa222c7

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl unzip \
 && rm -rf /var/lib/apt/lists/*

# Maven baixado do Maven Central e conferido pelo SHA-256 (validado contra o .sha512 oficial em 19/11/2026),
# no lugar do mvnw, que baixa sem conferir. Mesma versão do .mvn/wrapper do motor.
ARG MAVEN_VERSAO=3.9.5
ARG MAVEN_SHA256=7822eb593d29558d8edf87845a2c47e36e2a89d17a84cd2390824633214ed423
RUN curl -fsSL -o /tmp/maven.zip "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/${MAVEN_VERSAO}/apache-maven-${MAVEN_VERSAO}-bin.zip" \
 && echo "${MAVEN_SHA256}  /tmp/maven.zip" | sha256sum -c - \
 && unzip -q /tmp/maven.zip -d /opt \
 && ln -s "/opt/apache-maven-${MAVEN_VERSAO}/bin/mvn" /usr/local/bin/mvn \
 && rm /tmp/maven.zip

WORKDIR /src
RUN set -eu; \
    buscar() { git init -q "$1" && git -C "$1" fetch -q --depth 1 "https://github.com/ReceitaFederal/$2.git" "$3" && git -C "$1" checkout -q FETCH_HEAD; \
               test "$(git -C "$1" rev-parse HEAD)" = "$3"; }; \
    buscar sn calculadora-rtc-simples-nacional "$SN_COMMIT"; \
    buscar rr calculadora-rtc-regime-regular "$RR_COMMIT"

WORKDIR /src/sn
# Gera o banco, compila o jar (o spring-boot-maven-plugin deixa o devtools de fora por padrão)
# e grava o relatório das licenças das dependências do jar (sem test/provided) em /motor/licencas.
RUN cp -r ../rr/flyway ./flyway \
 && mkdir -p calculadora/db \
 && mvn -q -B flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf \
 && test -s calculadora/db/calculadora-pro.db \
 && mvn -q -B -DskipTests package \
 && mkdir -p /out/calculadora/db /out/licencas \
 && mvn -q -B org.codehaus.mojo:license-maven-plugin:2.9.0:add-third-party \
      -Dlicense.excludedScopes=test,provided,system \
      -Dlicense.outputDirectory=/out/licencas -Dlicense.thirdPartyFilename=THIRD-PARTY.txt \
 && test -s /out/licencas/THIRD-PARTY.txt \
 && cp target/api-simples-nacional.jar /out/app.jar \
 && cp calculadora/db/calculadora-pro.db /out/calculadora/db/ \
 && cp LICENSE /out/licencas/LICENSE-calculadora-rtc-simples-nacional \
 && cp ../rr/LICENSE /out/licencas/LICENSE-calculadora-rtc-regime-regular

FROM eclipse-temurin:21-jre-alpine@sha256:ac05c3c42b7c2f1a52c9bd52f01041fa1958231b15ebeae7420429cbc5baf474
RUN addgroup -S motor && adduser -S -G motor -H motor
WORKDIR /motor
COPY --from=build --chown=root:root /out/ /motor/
# O banco é aberto em modo somente leitura (mode=ro); o processo não precisa escrever nele.
RUN chmod -R a-w /motor
USER motor
# 8082 = API (/api), 9103 = health/métricas. Nenhuma porta é publicada no host.
EXPOSE 8082
# start-period longo: em computador lento o motor leva ~3 min para subir (medido em 24/11/2026: 179 s).
# Falhas dentro desse prazo não contam; o contêiner fica "healthy" assim que o primeiro teste passa.
HEALTHCHECK --interval=15s --timeout=5s --start-period=300s --start-interval=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:9103/health >/dev/null || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-Dspring.profiles.active=offline", "-jar", "/motor/app.jar"]
