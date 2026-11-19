# App do simulador (Node, sem dependências externas).
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
# Sem dependências: npm, npx, yarn e corepack não são necessários em execução.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/corepack /opt/yarn* \
 && mkdir -p /dados && chown node:node /dados
USER node
ENV HOST=0.0.0.0 PORTA=3000 HISTORICO_ARQUIVO=/dados/historico.db NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- --header="Host: localhost:3000" http://127.0.0.1:3000/api/saude >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "src/app.mjs"]
