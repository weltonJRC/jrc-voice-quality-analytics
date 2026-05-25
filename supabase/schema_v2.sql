-- ============================================================
-- JRC Voice Quality Analytics — Schema V2
-- Rodar manualmente no Supabase SQL Editor
-- NÃO usar DROP TABLE (seguro para reexecutar)
-- ============================================================

-- Extensão para UUIDs
create extension if not exists pgcrypto;

-- ============================================================
-- TABELA: chamadas_pabx
-- ============================================================
create table if not exists public.chamadas_pabx (
  id          uuid primary key default gen_random_uuid(),
  call_id     text not null unique,
  arquivo_audio text,
  telefone_origem text,
  ramal       text,
  agente      text,
  fila        text,
  duracao_segundos integer,
  status      text not null default 'pendente',
  data_chamada timestamptz not null default now(),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ============================================================
-- TABELA: transcricoes_pabx
-- ============================================================
create table if not exists public.transcricoes_pabx (
  id              uuid primary key default gen_random_uuid(),
  chamada_id      uuid not null references public.chamadas_pabx(id) on delete cascade,
  texto_transcrito text,
  modelo_transcricao text,
  criado_em       timestamptz not null default now()
);

-- ============================================================
-- TABELA: analises_sentimento_pabx (V1 — manter compatibilidade)
-- ============================================================
create table if not exists public.analises_sentimento_pabx (
  id                   uuid primary key default gen_random_uuid(),
  chamada_id           uuid not null references public.chamadas_pabx(id) on delete cascade,
  sentimento           text,
  score_sentimento     numeric(4,2),
  risco                text,
  intencao             text,
  motivo_principal     text,
  resumo               text,
  qualidade_atendimento integer,
  alerta               boolean default false,
  acoes_recomendadas   jsonb,
  payload_completo     jsonb,
  criado_em            timestamptz not null default now()
);

-- ============================================================
-- TABELA: analises_qualidade_pabx (V2 — tabela principal)
-- ============================================================
create table if not exists public.analises_qualidade_pabx (
  id uuid primary key default gen_random_uuid(),

  chamada_id uuid not null references public.chamadas_pabx(id) on delete cascade,

  -- Resumo geral
  resumo_conversa text,
  assuntos_abordados jsonb default '[]'::jsonb,

  -- Sentimentos
  sentimento_cliente text,
  sentimento_atendente text,
  temperatura_conversa text,
  tom_cliente text,
  tom_atendente text,

  -- Indicadores booleanos de comportamento
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

  -- Riscos
  risco_churn text,
  risco_reclamacao text,

  -- Avaliação numérica do atendente (0 a 100)
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

  -- Listas de insights
  pontos_positivos jsonb default '[]'::jsonb,
  pontos_negativos jsonb default '[]'::jsonb,
  oportunidades_melhoria jsonb default '[]'::jsonb,
  treinamento_recomendado jsonb default '[]'::jsonb,

  -- Classificação e status
  classificacao_ligacao text,
  status_monitoria text,
  alerta_supervisao boolean default false,
  motivo_alerta text,

  -- Qualidade da transcrição
  confianca_transcricao text,
  observacao_transcricao text,

  -- Payload completo (para auditoria e debug)
  payload_completo jsonb,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ============================================================
-- TRIGGER: atualizar atualizado_em automaticamente
-- ============================================================
create or replace function public.fn_atualizar_timestamp()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- Trigger em chamadas_pabx
drop trigger if exists tg_chamadas_pabx_updated on public.chamadas_pabx;
create trigger tg_chamadas_pabx_updated
  before update on public.chamadas_pabx
  for each row execute function public.fn_atualizar_timestamp();

-- Trigger em analises_qualidade_pabx
drop trigger if exists tg_analises_qualidade_updated on public.analises_qualidade_pabx;
create trigger tg_analises_qualidade_updated
  before update on public.analises_qualidade_pabx
  for each row execute function public.fn_atualizar_timestamp();

-- ============================================================
-- ÍNDICES para performance do Dashboard
-- ============================================================
create index if not exists idx_chamadas_call_id        on public.chamadas_pabx(call_id);
create index if not exists idx_chamadas_status         on public.chamadas_pabx(status);
create index if not exists idx_chamadas_data           on public.chamadas_pabx(data_chamada desc);

create index if not exists idx_transcricoes_chamada    on public.transcricoes_pabx(chamada_id);

create index if not exists idx_qualidade_chamada_id    on public.analises_qualidade_pabx(chamada_id);
create index if not exists idx_qualidade_nota_final    on public.analises_qualidade_pabx(nota_final);
create index if not exists idx_qualidade_alerta        on public.analises_qualidade_pabx(alerta_supervisao);
create index if not exists idx_qualidade_classificacao on public.analises_qualidade_pabx(classificacao_ligacao);
create index if not exists idx_qualidade_status        on public.analises_qualidade_pabx(status_monitoria);
create index if not exists idx_qualidade_temperatura   on public.analises_qualidade_pabx(temperatura_conversa);
create index if not exists idx_qualidade_churn         on public.analises_qualidade_pabx(risco_churn);
create index if not exists idx_qualidade_reclamacao    on public.analises_qualidade_pabx(risco_reclamacao);
create index if not exists idx_qualidade_criado_em     on public.analises_qualidade_pabx(criado_em desc);

-- ============================================================
-- VIEW: vw_qualidade_pabx_dashboard
-- Unifica dados para o dashboard frontend
-- ============================================================
create or replace view public.vw_qualidade_pabx_dashboard as
select
  aq.id                              as analise_id,
  c.id                               as chamada_id,
  c.call_id,
  c.arquivo_audio,
  c.telefone_origem,
  c.ramal,
  c.agente,
  c.fila,
  c.duracao_segundos,
  c.data_chamada,
  c.status                           as status_chamada,
  t.texto_transcrito,
  t.modelo_transcricao,
  aq.resumo_conversa,
  aq.assuntos_abordados,
  aq.sentimento_cliente,
  aq.sentimento_atendente,
  aq.temperatura_conversa,
  aq.tom_cliente,
  aq.tom_atendente,
  aq.houve_agressividade_cliente,
  aq.houve_agressividade_atendente,
  aq.houve_empatia,
  aq.houve_cordialidade,
  aq.houve_interrupcao,
  aq.cliente_demonstrou_insatisfacao,
  aq.cliente_ameacou_cancelar,
  aq.cliente_mencionou_procon_anatel,
  aq.cliente_mencionou_processo,
  aq.problema_resolvido,
  aq.necessita_retorno,
  aq.risco_churn,
  aq.risco_reclamacao,
  aq.cordialidade,
  aq.empatia,
  aq.clareza_comunicacao,
  aq.dominio_assunto,
  aq.conducao_conversa,
  aq.resolucao_problema,
  aq.cumprimento_protocolo,
  aq.controle_emocional,
  aq.experiencia_cliente,
  aq.nota_final,
  aq.pontos_positivos,
  aq.pontos_negativos,
  aq.oportunidades_melhoria,
  aq.treinamento_recomendado,
  aq.classificacao_ligacao,
  aq.status_monitoria,
  aq.alerta_supervisao,
  aq.motivo_alerta,
  aq.confianca_transcricao,
  aq.observacao_transcricao,
  aq.payload_completo,
  aq.criado_em                       as analise_criada_em
from public.analises_qualidade_pabx aq
join public.chamadas_pabx c on aq.chamada_id = c.id
left join public.transcricoes_pabx t on t.chamada_id = c.id;

-- ============================================================
-- VIEW: vw_qualidade_pabx_metricas
-- Agrega métricas para o card de KPIs do dashboard
-- ============================================================
create or replace view public.vw_qualidade_pabx_metricas as
select
  count(*)                                                                        as total_analisadas,
  round(avg(nota_final)::numeric, 1)                                              as nota_media,
  count(*) filter (where alerta_supervisao = true)                                as total_alertas_supervisao,
  count(*) filter (where classificacao_ligacao = 'critica')                       as total_criticas,
  count(*) filter (where temperatura_conversa = 'fria')                           as total_conversas_frias,
  count(*) filter (where temperatura_conversa = 'neutra')                         as total_conversas_neutras,
  count(*) filter (where temperatura_conversa = 'quente')                         as total_conversas_quentes,
  count(*) filter (where temperatura_conversa = 'critica')                        as total_conversas_criticas,
  count(*) filter (where risco_churn in ('alto', 'critico'))                      as total_risco_churn_alto_critico,
  count(*) filter (where risco_reclamacao in ('alto', 'critico'))                 as total_risco_reclamacao_alto_critico,
  count(*) filter (where status_monitoria = 'aprovada')                           as total_aprovadas,
  count(*) filter (where status_monitoria = 'aprovada_com_observacao')            as total_aprovadas_com_observacao,
  count(*) filter (where status_monitoria = 'reprovada')                          as total_reprovadas,
  count(*) filter (where status_monitoria = 'critica_para_supervisao')            as total_criticas_para_supervisao
from public.analises_qualidade_pabx;

-- ============================================================
-- RLS — Habilitar sem policies públicas
-- O backend usa service_role, então RLS não bloqueia o backend
-- ============================================================
alter table public.chamadas_pabx            enable row level security;
alter table public.transcricoes_pabx        enable row level security;
alter table public.analises_sentimento_pabx enable row level security;
alter table public.analises_qualidade_pabx  enable row level security;

-- ============================================================
-- GRANTS para service_role (caso necessário)
-- ============================================================
grant all on public.chamadas_pabx            to service_role;
grant all on public.transcricoes_pabx        to service_role;
grant all on public.analises_sentimento_pabx to service_role;
grant all on public.analises_qualidade_pabx  to service_role;
grant select on public.vw_qualidade_pabx_dashboard to service_role;
grant select on public.vw_qualidade_pabx_metricas  to service_role;

-- ============================================================
-- FIM DO SCHEMA V2
-- ============================================================
