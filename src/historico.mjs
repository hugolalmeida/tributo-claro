// Histórico de simulações em SQLite (node:sqlite, sem dependências externas).
// Guarda entrada, resposta do motor, versões e situação. Não há dado pessoal
// no formulário (sem CNPJ, nome ou e-mail).

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function abrirHistorico(caminho) {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS simulacoes (
      id TEXT PRIMARY KEY,
      criado_em TEXT NOT NULL,
      situacao TEXT NOT NULL,
      http_status_motor INTEGER,
      versao_app_motor TEXT,
      versao_banco_motor TEXT,
      entrada TEXT NOT NULL,
      payload_motor TEXT,
      resposta_motor TEXT,
      resultado TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_simulacoes_criado_em ON simulacoes (criado_em DESC);
  `);

  const inserir = db.prepare(`INSERT INTO simulacoes
    (id, criado_em, situacao, http_status_motor, versao_app_motor, versao_banco_motor, entrada, payload_motor, resposta_motor, resultado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const listar = db.prepare(`SELECT id, criado_em, situacao, versao_app_motor, versao_banco_motor, entrada, resultado
    FROM simulacoes ORDER BY criado_em DESC LIMIT ?`);
  const buscar = db.prepare('SELECT * FROM simulacoes WHERE id = ?');

  const json = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
  const ler = (v) => (v ? JSON.parse(v) : null);

  return {
    salvar({ situacao, httpStatus = null, versao = {}, entrada, payload = null, resposta = null, resultado = null }) {
      const id = randomUUID();
      const criadoEm = new Date().toISOString();
      inserir.run(id, criadoEm, situacao, httpStatus, versao.app ?? null, versao.banco ?? null,
        json(entrada), json(payload), json(resposta), json(resultado));
      return { id, criadoEm };
    },
    listar(limite = 50) {
      return listar.all(limite).map((r) => {
        const entrada = ler(r.entrada);
        const resultado = ler(r.resultado);
        return {
          id: r.id,
          criadoEm: r.criado_em,
          situacao: r.situacao,
          versaoMotor: { app: r.versao_app_motor, banco: r.versao_banco_motor },
          data: entrada?.data ?? null,
          regime: entrada?.regime ?? null,
          itens: entrada?.itens?.length ?? 0,
          totalTributos: resultado?.total?.totalTributos ?? null,
        };
      });
    },
    buscar(id) {
      const r = buscar.get(id);
      if (!r) return null;
      return {
        id: r.id,
        criadoEm: r.criado_em,
        situacao: r.situacao,
        httpStatusMotor: r.http_status_motor,
        versaoMotor: { app: r.versao_app_motor, banco: r.versao_banco_motor },
        entrada: ler(r.entrada),
        payloadMotor: ler(r.payload_motor),
        respostaMotor: ler(r.resposta_motor),
        resultado: ler(r.resultado),
      };
    },
    fechar() { db.close(); },
  };
}
