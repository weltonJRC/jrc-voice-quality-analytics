-- ==========================================
-- MIGRATION SQL: JRC Voice Quality Analytics V2
-- ==========================================

-- 1. Criar a tabela de análises de qualidade
create table if not exists public.analises_qualidade_pabx (
  id uuid primary key default gen_random_uuid(),

  chamada_id uuid not null references public.chamadas_pabx(id) on delete cascade,

  resumo_conversa text,
  assuntos_abordados jsonb,

  sentimento_cliente text,
  sentimento_atendente text,
  temperatura_conversa text,
  tom_cliente text,
  tom_atendente text,

  houve_agressividade_cliente boolean default false,
  houve_agressividade_atendente boolean default false,
  houve_empatia boolean default false,
  houve_cordialidade boolean default false,
  houve_interrupcao boolean default false,

  cliente_demonstrou_insatisfacao boolean default false,
  cliente_ameacou_cancelar boolean default false,
  cliente_mencionou_procon_anatel boolean default false,
  cliente_mencionou_processo boolean default false,

  problema_resolvido boolean default false,
  necessita_retorno boolean default false,

  risco_churn text,
  risco_reclamacao text,

  cordialidade integer,
  empatia integer,
  clareza_comunicacao integer,
  dominio_assunto integer,
  conducao_conversa integer,
  resolucao_problema integer,
  cumprimento_protocolo integer,
  controle_emocional integer,
  experiencia_cliente integer,
  nota_final integer,

  pontos_positivos jsonb,
  pontos_negativos jsonb,
  oportunidades_melhoria jsonb,
  treinamento_recomendado jsonb,

  classificacao_ligacao text,
  status_monitoria text,
  alerta_supervisao boolean default false,
  motivo_alerta text,

  confianca_transcricao text,
  observacao_transcricao text,

  payload_completo jsonb,

  criado_em timestamptz not null default now()
);

-- 2. Criar índices para otimização de performance
create index if not exists idx_qualidade_chamada_id on public.analises_qualidade_pabx(chamada_id);
create index if not exists idx_qualidade_nota_final on public.analises_qualidade_pabx(nota_final);
create index if not exists idx_qualidade_alerta_supervisao on public.analises_qualidade_pabx(alerta_supervisao);
create index if not exists idx_qualidade_classificacao on public.analises_qualidade_pabx(classificacao_ligacao);
create index if not exists idx_qualidade_status_monitoria on public.analises_qualidade_pabx(status_monitoria);
create index if not exists idx_qualidade_temperatura on public.analises_qualidade_pabx(temperatura_conversa);
create index if not exists idx_qualidade_risco_churn on public.analises_qualidade_pabx(risco_churn);
create index if not exists idx_qualidade_risco_reclamacao on public.analises_qualidade_pabx(risco_reclamacao);

-- 3. Criar a view para unificação dos dados do Dashboard
create or replace view public.vw_qualidade_pabx_dashboard as
select
  q.id as analise_id,
  c.id as chamada_id,
  c.call_id,
  c.arquivo_audio,
  c.telefone_origem,
  c.ramal,
  c.agente,
  c.fila,
  c.data_chamada,
  c.status as status_chamada,
  t.texto_transcrito,
  t.modelo_transcricao,
  q.resumo_conversa,
  q.assuntos_abordados,
  q.sentimento_cliente,
  q.sentimento_atendente,
  q.temperatura_conversa,
  q.tom_cliente,
  q.tom_atendente,
  q.houve_agressividade_cliente,
  q.houve_agressividade_atendente,
  q.houve_empatia,
  q.houve_cordialidade,
  q.houve_interrupcao,
  q.cliente_demonstrou_insatisfacao,
  q.cliente_ameacou_cancelar,
  q.cliente_mencionou_procon_anatel,
  q.cliente_mencionou_processo,
  q.problema_resolvido,
  q.necessita_retorno,
  q.risco_churn,
  q.risco_reclamacao,
  q.cordialidade,
  q.empatia,
  q.clareza_comunicacao,
  q.dominio_assunto,
  q.conducao_conversa,
  q.resolucao_problema,
  q.cumprimento_protocolo,
  q.controle_emocional,
  q.experiencia_cliente,
  q.nota_final,
  q.pontos_positivos,
  q.pontos_negativos,
  q.oportunidades_melhoria,
  q.treinamento_recomendado,
  q.classificacao_ligacao,
  q.status_monitoria,
  q.alerta_supervisao,
  q.motivo_alerta,
  q.confianca_transcricao,
  q.observacao_transcricao,
  q.payload_completo,
  q.criado_em as analise_criada_em
from public.analises_qualidade_pabx q
join public.chamadas_pabx c on q.chamada_id = c.id
left join public.transcricoes_pabx t on t.chamada_id = c.id;
