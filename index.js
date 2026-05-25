// ============================================================
// JRC Voice Quality Analytics — Backend V2.0.0
// Node.js + Express + Supabase + OpenAI (opcional)
// ============================================================

import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// ============================================================
// VALIDAÇÃO DE AMBIENTE
// ============================================================
function validarEnv() {
  const obrigatorias = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const faltando = obrigatorias.filter(
    (k) => !process.env[k] || process.env[k].trim() === ''
  );
  if (faltando.length > 0) {
    throw new Error(
      `[JRC] Variáveis obrigatórias ausentes no .env: ${faltando.join(', ')}`
    );
  }
}

validarEnv();

// ============================================================
// CLIENTES
// ============================================================
const TEM_OPENAI = Boolean(
  process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== ''
);

const TEM_BASE_URL = Boolean(
  process.env.OPENAI_BASE_URL && process.env.OPENAI_BASE_URL.trim() !== ''
);

const openai = TEM_OPENAI
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: TEM_BASE_URL ? process.env.OPENAI_BASE_URL.trim() : undefined,
    })
  : null;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Logs seguros — sem expor chaves
console.log('[JRC] OpenAI configurada:', TEM_OPENAI);
console.log('[JRC] OpenAI baseURL customizada:', TEM_BASE_URL);

// ============================================================
// EXPRESS
// ============================================================
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const UPLOADS_DIR = 'uploads';

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    const permitidos = [
      'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/webm',
      'audio/ogg', 'audio/x-wav', 'audio/x-m4a',
      'video/mp4', 'video/webm',
    ];
    if (
      permitidos.includes(file.mimetype) ||
      /\.(mp3|wav|m4a|webm|mpeg|mpga|ogg)$/i.test(file.originalname)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Formato de áudio não suportado.'));
    }
  },
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ============================================================
// SCHEMA OPENAI V2 — ANÁLISE DE QUALIDADE
// ============================================================
const ANALISE_QUALIDADE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    resumo_conversa: { type: 'string' },
    resumo_humanizado: { type: 'string' },
    assuntos_abordados: { type: 'array', items: { type: 'string' } },
    motivo_contato: { type: 'string' },
    necessidade_cliente: { type: 'string' },
    desfecho_ligacao: { type: 'string' },
    falantes_identificados: { type: 'boolean' },
    speaker_mapping_confidence: { type: 'string', enum: ['alta', 'media', 'baixa'] },
    observacao_falantes: { type: 'string' },
    sentimento_cliente: {
      type: 'string',
      enum: ['positivo', 'neutro', 'negativo', 'critico', 'nao_identificado'],
    },
    sentimento_atendente: {
      type: 'string',
      enum: ['positivo', 'neutro', 'negativo', 'nao_identificado'],
    },
    sensacao_conversa: {
      type: 'string',
      enum: ['tranquila', 'objetiva', 'cordial', 'confusa', 'tensa', 'desgastante', 'insatisfeita', 'critica', 'inconclusiva'],
    },
    temperatura_conversa: {
      type: 'string',
      enum: ['fria', 'neutra', 'quente', 'critica'],
    },
    tom_cliente: {
      type: 'string',
      enum: ['calmo', 'cordial', 'confuso', 'irritado', 'agressivo', 'insatisfeito', 'frustrado', 'ansioso', 'nao_identificado'],
    },
    tom_atendente: {
      type: 'string',
      enum: ['cordial', 'neutro', 'impaciente', 'agressivo', 'empatico', 'tecnico', 'robotico', 'inseguro', 'nao_identificado'],
    },
    houve_agressividade_cliente: { type: 'boolean' },
    houve_agressividade_atendente: { type: 'boolean' },
    houve_empatia: { type: 'boolean' },
    houve_cordialidade: { type: 'boolean' },
    houve_interrupcao: { type: 'boolean' },
    cliente_demonstrou_insatisfacao: { type: 'boolean' },
    cliente_ameacou_cancelar: { type: 'boolean' },
    cliente_mencionou_procon_anatel: { type: 'boolean' },
    cliente_mencionou_processo: { type: 'boolean' },
    problema_resolvido: { type: 'boolean' },
    necessita_retorno: { type: 'boolean' },
    risco_churn: { type: 'string', enum: ['baixo', 'medio', 'alto', 'critico'] },
    risco_reclamacao: { type: 'string', enum: ['baixo', 'medio', 'alto', 'critico'] },
    avaliacao_atendente: {
      type: 'object',
      additionalProperties: false,
      properties: {
        cordialidade: { type: 'integer', minimum: 0, maximum: 10 },
        empatia: { type: 'integer', minimum: 0, maximum: 10 },
        clareza_comunicacao: { type: 'integer', minimum: 0, maximum: 10 },
        dominio_assunto: { type: 'integer', minimum: 0, maximum: 10 },
        conducao_conversa: { type: 'integer', minimum: 0, maximum: 10 },
        resolucao_problema: { type: 'integer', minimum: 0, maximum: 15 },
        cumprimento_protocolo: { type: 'integer', minimum: 0, maximum: 10 },
        controle_emocional: { type: 'integer', minimum: 0, maximum: 10 },
        experiencia_cliente: { type: 'integer', minimum: 0, maximum: 15 },
        nota_final: { type: 'integer', minimum: 0, maximum: 100 },
      },
      required: [
        'cordialidade', 'empatia', 'clareza_comunicacao', 'dominio_assunto',
        'conducao_conversa', 'resolucao_problema', 'cumprimento_protocolo',
        'controle_emocional', 'experiencia_cliente', 'nota_final',
      ],
    },
    pontos_positivos: { type: 'array', items: { type: 'string' } },
    pontos_negativos: { type: 'array', items: { type: 'string' } },
    oportunidades_melhoria: { type: 'array', items: { type: 'string' } },
    treinamento_recomendado: { type: 'array', items: { type: 'string' } },
    classificacao_ligacao: {
      type: 'string',
      enum: ['excelente', 'boa', 'regular', 'ruim', 'critica'],
    },
    status_monitoria: {
      type: 'string',
      enum: ['aprovada', 'aprovada_com_observacao', 'reprovada', 'critica_para_supervisao'],
    },
    alerta_supervisao: { type: 'boolean' },
    motivo_alerta: { type: 'string' },
    confianca_transcricao: { type: 'string', enum: ['alta', 'media', 'baixa'] },
    observacao_transcricao: { type: 'string' },
    confianca_analise: { type: 'string', enum: ['alta', 'media', 'baixa'] },
    justificativa_nota: { type: 'string' },
    parecer_monitoria: { type: 'string' },
    recomendacao_supervisor: { type: 'string' },
    trechos_relevantes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tipo: { type: 'string', enum: ['insatisfacao', 'elogio', 'risco', 'resolucao', 'empatia', 'agressividade', 'duvida'] },
          falante_estimado: { type: 'string', enum: ['cliente', 'atendente', 'nao_identificado'] },
          trecho: { type: 'string' },
          interpretacao: { type: 'string' },
        },
        required: ['tipo', 'falante_estimado', 'trecho', 'interpretacao'],
      },
    },
  },
  required: [
    'resumo_conversa', 'resumo_humanizado', 'assuntos_abordados', 'motivo_contato',
    'necessidade_cliente', 'desfecho_ligacao', 'falantes_identificados',
    'speaker_mapping_confidence', 'observacao_falantes', 'sentimento_cliente',
    'sentimento_atendente', 'sensacao_conversa', 'temperatura_conversa', 'tom_cliente',
    'tom_atendente', 'houve_agressividade_cliente', 'houve_agressividade_atendente',
    'houve_empatia', 'houve_cordialidade', 'houve_interrupcao', 'cliente_demonstrou_insatisfacao',
    'cliente_ameacou_cancelar', 'cliente_mencionou_procon_anatel',
    'cliente_mencionou_processo', 'problema_resolvido', 'necessita_retorno',
    'risco_churn', 'risco_reclamacao', 'avaliacao_atendente', 'pontos_positivos',
    'pontos_negativos', 'oportunidades_melhoria', 'treinamento_recomendado',
    'classificacao_ligacao', 'status_monitoria', 'alerta_supervisao',
    'motivo_alerta', 'confianca_transcricao', 'observacao_transcricao',
    'confianca_analise', 'justificativa_nota', 'parecer_monitoria',
    'recomendacao_supervisor', 'trechos_relevantes',
  ],
};

// ============================================================
// HELPERS
// ============================================================

/**
 * Normaliza um valor para array JSON (seguro para salvar no Supabase jsonb).
 */
function normalizarArrayJson(valor) {
  if (Array.isArray(valor)) return valor;
  if (typeof valor === 'string') {
    try { return JSON.parse(valor); } catch { return [valor]; }
  }
  return [];
}

/**
 * Detecta qualidade da transcrição por heurísticas simples.
 */
function detectarQualidadeTranscricao(texto) {
  if (!texto || texto.trim().length < 20) {
    return {
      confianca_transcricao: 'baixa',
      observacao_transcricao:
        'A transcrição parece incompleta, repetitiva ou com baixa qualidade. Recomenda-se reenviar o áudio ou usar modelo de transcrição melhor.',
    };
  }

  // Detecta repetição de palavras ou frases curtas
  const repPalavras = (texto.match(/(\b\w+\b)\s+\1\s+\1/g) || []).length;
  const repFrase = (texto.match(/não sei se eu não sei se eu/gi) || []).length;
  if (repPalavras > 3 || repFrase > 0) {
    return {
      confianca_transcricao: 'baixa',
      observacao_transcricao:
        'A transcrição apresenta muitas repetições, indicando baixa qualidade do áudio ou do modelo. Recomenda-se usar um modelo maior como whisper-small.',
    };
  }

  if (texto.trim().length < 100) {
    return {
      confianca_transcricao: 'media',
      observacao_transcricao:
        'Transcrição curta. A análise local pode ter precisão limitada.',
    };
  }

  return {
    confianca_transcricao: 'alta',
    observacao_transcricao: 'Transcrição com boa legibilidade.',
  };
}

// ============================================================
// FUNÇÕES DE BANCO DE DADOS
// ============================================================

async function registrarChamada(fileName) {
  const callId = `${Date.now()}-${fileName}`;
  const { data, error } = await supabase
    .from('chamadas_pabx')
    .insert({
      call_id: callId,
      arquivo_audio: fileName,
      status: 'processando',
      data_chamada: new Date().toISOString(),
    })
    .select('id, call_id')
    .single();

  if (error) throw new Error(`Erro ao registrar chamada: ${error.message}`);
  return data;
}

async function salvarTranscricao(chamadaId, texto, modelo) {
  const { error } = await supabase.from('transcricoes_pabx').insert({
    chamada_id: chamadaId,
    texto_transcrito: texto,
    modelo_transcricao: modelo,
  });
  if (error) throw new Error(`Erro ao salvar transcrição: ${error.message}`);
}

async function salvarAnaliseQualidade(chamadaId, analise) {
  const av = analise.avaliacao_atendente || {};
  const { error } = await supabase.from('analises_qualidade_pabx').insert({
    chamada_id: chamadaId,

    resumo_conversa: analise.resumo_conversa,
    assuntos_abordados: normalizarArrayJson(analise.assuntos_abordados),

    sentimento_cliente: analise.sentimento_cliente,
    sentimento_atendente: analise.sentimento_atendente,
    temperatura_conversa: analise.temperatura_conversa,
    tom_cliente: analise.tom_cliente,
    tom_atendente: analise.tom_atendente,

    houve_agressividade_cliente: Boolean(analise.houve_agressividade_cliente),
    houve_agressividade_atendente: Boolean(analise.houve_agressividade_atendente),
    houve_empatia: Boolean(analise.houve_empatia),
    houve_cordialidade: Boolean(analise.houve_cordialidade),
    houve_interrupcao: Boolean(analise.houve_interrupcao),
    cliente_demonstrou_insatisfacao: Boolean(analise.cliente_demonstrou_insatisfacao),
    cliente_ameacou_cancelar: Boolean(analise.cliente_ameacou_cancelar),
    cliente_mencionou_procon_anatel: Boolean(analise.cliente_mencionou_procon_anatel),
    cliente_mencionou_processo: Boolean(analise.cliente_mencionou_processo),
    problema_resolvido: Boolean(analise.problema_resolvido),
    necessita_retorno: Boolean(analise.necessita_retorno),

    risco_churn: analise.risco_churn,
    risco_reclamacao: analise.risco_reclamacao,

    cordialidade: av.cordialidade ?? 0,
    empatia: av.empatia ?? 0,
    clareza_comunicacao: av.clareza_comunicacao ?? 0,
    dominio_assunto: av.dominio_assunto ?? 0,
    conducao_conversa: av.conducao_conversa ?? 0,
    resolucao_problema: av.resolucao_problema ?? 0,
    cumprimento_protocolo: av.cumprimento_protocolo ?? 0,
    controle_emocional: av.controle_emocional ?? 0,
    experiencia_cliente: av.experiencia_cliente ?? 0,
    nota_final: av.nota_final ?? 0,

    pontos_positivos: normalizarArrayJson(analise.pontos_positivos),
    pontos_negativos: normalizarArrayJson(analise.pontos_negativos),
    oportunidades_melhoria: normalizarArrayJson(analise.oportunidades_melhoria),
    treinamento_recomendado: normalizarArrayJson(analise.treinamento_recomendado),

    classificacao_ligacao: analise.classificacao_ligacao,
    status_monitoria: analise.status_monitoria,
    alerta_supervisao: Boolean(analise.alerta_supervisao),
    motivo_alerta: analise.motivo_alerta || '',

    confianca_transcricao: analise.confianca_transcricao,
    observacao_transcricao: analise.observacao_transcricao,

    payload_completo: analise,
  });
  if (error) throw new Error(`Erro ao salvar análise de qualidade: ${error.message}`);
}

async function atualizarStatus(chamadaId, status) {
  const { error } = await supabase
    .from('chamadas_pabx')
    .update({ status })
    .eq('id', chamadaId);
  if (error) console.error(`[JRC] Erro ao atualizar status: ${error.message}`);
}

// ============================================================
// MOTOR DE ANÁLISE LOCAL (sem OpenAI)
// ============================================================

function analisarQualidadeLocal(texto) {
  const t = (texto || '').toLowerCase();

  // --- Qualidade da transcrição ---
  const { confianca_transcricao, observacao_transcricao } =
    detectarQualidadeTranscricao(texto);

  // --- Listas de palavras-chave ---
  const CRITICAS = [
    'cancelar', 'cancelamento', 'vou cancelar', 'quero cancelar',
    'anatel', 'procon', 'processo', 'advogado', 'justiça',
    'vou processar', 'não aguento mais', 'ninguém resolve',
    'descaso', 'absurdo',
  ];
  const NEGATIVAS = [
    'problema', 'ruim', 'péssimo', 'horrível', 'lento', 'sem internet',
    'internet caiu', 'queda', 'instabilidade', 'não funciona',
    'cobrança indevida', 'cobrou errado', 'demora', 'não resolveram',
    'reclamação', 'insatisfeito',
  ];
  const POSITIVAS = [
    'obrigado', 'obrigada', 'resolvido', 'funcionou', 'bom atendimento',
    'excelente', 'ótimo', 'satisfeito', 'perfeito', 'agradeço',
  ];
  const EMPATIA_KW = ['entendo', 'compreendo', 'sinto muito', 'vamos resolver', 'peço desculpas', 'desculpe', 'lamento'];
  const CORDIALIDADE_KW = ['bom dia', 'boa tarde', 'boa noite', 'por favor', 'senhor', 'senhora', 'à disposição', 'meu nome é', 'como posso'];
  const RESOLUCAO_KW = ['resolvido', 'normalizado', 'solucionado', 'voltou a funcionar', 'funcionando'];
  const RETORNO_KW = ['chamado', 'protocolo', 'retorno', 'equipe técnica', 'visita', 'prazo'];
  const INTERRUPCAO_KW = ['me deixa falar', 'me escuta', 'calma', 'deixa eu terminar'];
  const IMPACIENCIA_KW = ['já falei', 'não posso fazer nada', 'não é comigo', 'desliga e liga', 'cala a boca', 'problema seu'];

  const temCritico = CRITICAS.some(p => t.includes(p));
  const temNegativo = NEGATIVAS.some(p => t.includes(p));
  const temPositivo = POSITIVAS.some(p => t.includes(p));
  const temCancelar = t.includes('cancelar') || t.includes('cancelamento');
  const temAnatelProcon = t.includes('anatel') || t.includes('procon');
  const temProcesso = t.includes('processo') || t.includes('processar') || t.includes('advogado');

  const houve_empatia = EMPATIA_KW.some(p => t.includes(p));
  const houve_cordialidade = CORDIALIDADE_KW.some(p => t.includes(p));
  const houve_interrupcao = INTERRUPCAO_KW.some(p => t.includes(p));
  const temImpaciencia = IMPACIENCIA_KW.some(p => t.includes(p));
  const problema_resolvido = RESOLUCAO_KW.some(p => t.includes(p));
  const necessita_retorno = RETORNO_KW.some(p => t.includes(p)) && !problema_resolvido;

  // --- Comportamento do cliente ---
  const houve_agressividade_cliente =
    (t.includes('absurdo') || t.includes('descaso')) && temCritico;
  const cliente_demonstrou_insatisfacao = temNegativo || temCritico;
  const cliente_ameacou_cancelar = temCancelar;
  const cliente_mencionou_procon_anatel = temAnatelProcon;
  const cliente_mencionou_processo = temProcesso;

  // --- Comportamento do atendente ---
  const houve_agressividade_atendente =
    t.includes('cala a boca') || t.includes('problema seu');

  // --- Tom cliente ---
  let tom_cliente = 'calmo';
  if (temCritico && houve_agressividade_cliente) tom_cliente = 'agressivo';
  else if (temCritico) tom_cliente = 'insatisfeito';
  else if (temNegativo) tom_cliente = 'irritado';
  else if (temPositivo) tom_cliente = 'cordial';

  // --- Tom atendente ---
  let tom_atendente = 'neutro';
  if (houve_agressividade_atendente) tom_atendente = 'agressivo';
  else if (temImpaciencia) tom_atendente = 'impaciente';
  else if (houve_empatia) tom_atendente = 'empatico';
  else if (houve_cordialidade) tom_atendente = 'cordial';

  // --- Sentimentos ---
  let sentimento_cliente = 'neutro';
  if (temCritico) sentimento_cliente = 'critico';
  else if (temNegativo) sentimento_cliente = 'negativo';
  else if (temPositivo) sentimento_cliente = 'positivo';

  let sentimento_atendente = 'neutro';
  if (houve_agressividade_atendente || temImpaciencia) sentimento_atendente = 'negativo';
  else if (houve_empatia || houve_cordialidade) sentimento_atendente = 'positivo';

  // --- Temperatura ---
  let temperatura_conversa = 'neutra';
  if (temCritico || houve_agressividade_cliente || houve_agressividade_atendente || temAnatelProcon || temProcesso) {
    temperatura_conversa = 'critica';
  } else if (temNegativo) {
    temperatura_conversa = 'quente';
  } else if (temPositivo && !temNegativo) {
    temperatura_conversa = 'fria';
  }

  // --- Riscos ---
  let risco_churn = 'baixo';
  if (temCritico && temCancelar) risco_churn = 'critico';
  else if (temCritico) risco_churn = 'alto';
  else if (temNegativo) risco_churn = 'medio';

  let risco_reclamacao = 'baixo';
  if (temAnatelProcon || temProcesso) risco_reclamacao = 'critico';
  else if (temCritico) risco_reclamacao = 'alto';
  else if (temNegativo) risco_reclamacao = 'medio';

  // --- Assuntos ---
  const assuntos_abordados = [];
  if (/boleto|pagamento|cobran[çc]a|fatura|mensalidade|vencimento/.test(t)) assuntos_abordados.push('financeiro');
  if (/internet|roteador|wifi|wi-fi|sinal|queda|lento|lentid[ãa]o|fibra/.test(t)) assuntos_abordados.push('suporte técnico');
  if (temCancelar) assuntos_abordados.push('cancelamento');
  if (temAnatelProcon || temProcesso || t.includes('reclamação') || t.includes('reclamar')) assuntos_abordados.push('reclamação');
  if (/plano|upgrade|contratar|contrato|comercial/.test(t)) assuntos_abordados.push('comercial');
  if (/obrigado|obrigada|excelente|[oó]timo|bom atendimento/.test(t)) assuntos_abordados.push('elogio');
  if (assuntos_abordados.length === 0) assuntos_abordados.push('outros');

  // --- Notas ---
  let cordialidade = houve_cordialidade ? 9 : 6;
  if (houve_agressividade_atendente) cordialidade = 1;

  let empatia = houve_empatia ? 9 : 5;
  if (houve_agressividade_atendente) empatia = 1;

  let clareza_comunicacao = confianca_transcricao === 'baixa' ? 5 : 8;

  let dominio_assunto = 8;
  if (houve_agressividade_atendente) dominio_assunto = 3;

  let conducao_conversa = houve_interrupcao ? 6 : 8;
  if (houve_agressividade_atendente) conducao_conversa = 2;

  let resolucao_problema = problema_resolvido ? 14 : necessita_retorno ? 5 : 8;

  let cumprimento_protocolo = houve_cordialidade ? 9 : 6;

  let controle_emocional = houve_agressividade_atendente ? 2 : temperatura_conversa === 'critica' ? 6 : 9;

  let experiencia_cliente =
    sentimento_cliente === 'positivo' ? 14 :
    sentimento_cliente === 'neutro' ? 9 :
    sentimento_cliente === 'negativo' ? 5 : 2;

  const nota_final = Math.min(100,
    cordialidade + empatia + clareza_comunicacao + dominio_assunto +
    conducao_conversa + resolucao_problema + cumprimento_protocolo +
    controle_emocional + experiencia_cliente
  );

  // --- Classificação ---
  let classificacao_ligacao = 'regular';
  if (nota_final >= 90 && temperatura_conversa !== 'critica' && !houve_agressividade_atendente) {
    classificacao_ligacao = 'excelente';
  } else if (nota_final >= 75 && temperatura_conversa !== 'critica') {
    classificacao_ligacao = 'boa';
  } else if (nota_final >= 60) {
    classificacao_ligacao = 'regular';
  } else if (nota_final >= 40) {
    classificacao_ligacao = 'ruim';
  } else {
    classificacao_ligacao = 'critica';
  }
  if (temperatura_conversa === 'critica' || houve_agressividade_atendente || houve_agressividade_cliente) {
    classificacao_ligacao = 'critica';
  }

  // --- Status monitoria ---
  let status_monitoria = 'aprovada';
  if (classificacao_ligacao === 'excelente' || (classificacao_ligacao === 'boa' && nota_final >= 80)) {
    status_monitoria = 'aprovada';
  } else if (classificacao_ligacao === 'boa' || classificacao_ligacao === 'regular') {
    status_monitoria = 'aprovada_com_observacao';
  } else if (classificacao_ligacao === 'ruim') {
    status_monitoria = 'reprovada';
  } else {
    status_monitoria = 'critica_para_supervisao';
  }
  if (temperatura_conversa === 'critica' || houve_agressividade_atendente || risco_churn === 'critico' || risco_reclamacao === 'critico') {
    status_monitoria = 'critica_para_supervisao';
  }

  // --- Alerta supervisão ---
  let alerta_supervisao = false;
  let motivo_alerta = '';
  if (houve_agressividade_cliente) {
    alerta_supervisao = true;
    motivo_alerta = 'Cliente demonstrou agressividade durante a ligação.';
  } else if (houve_agressividade_atendente) {
    alerta_supervisao = true;
    motivo_alerta = 'Atendente tratou o cliente com grosseria ou agressividade.';
  } else if (cliente_ameacou_cancelar) {
    alerta_supervisao = true;
    motivo_alerta = 'Risco imediato de churn: cliente ameaçou cancelar o serviço.';
  } else if (cliente_mencionou_procon_anatel) {
    alerta_supervisao = true;
    motivo_alerta = 'Alerta regulatório: cliente mencionou Procon ou Anatel.';
  } else if (cliente_mencionou_processo) {
    alerta_supervisao = true;
    motivo_alerta = 'Risco jurídico: cliente ameaçou processo ou citou advogado.';
  } else if (nota_final < 60) {
    alerta_supervisao = true;
    motivo_alerta = `Qualidade do atendimento abaixo do mínimo aceitável (nota: ${nota_final}/100).`;
  } else if (risco_churn === 'alto' || risco_churn === 'critico') {
    alerta_supervisao = true;
    motivo_alerta = `Risco de churn ${risco_churn} identificado na ligação.`;
  } else if (risco_reclamacao === 'alto' || risco_reclamacao === 'critico') {
    alerta_supervisao = true;
    motivo_alerta = `Risco de reclamação ${risco_reclamacao} identificado na ligação.`;
  } else if (cliente_demonstrou_insatisfacao && !problema_resolvido) {
    alerta_supervisao = true;
    motivo_alerta = 'Cliente insatisfeito e problema não resolvido na ligação.';
  }

  // --- Pontos e recomendações ---
  const pontos_positivos = [];
  const pontos_negativos = [];
  const oportunidades_melhoria = [];
  const treinamento_recomendado = [];

  if (houve_cordialidade) pontos_positivos.push('Atendente utilizou linguagem cordial e respeitosa.');
  if (houve_empatia) pontos_positivos.push('Atendente demonstrou empatia e atenção ao cliente.');
  if (problema_resolvido) pontos_positivos.push('O problema do cliente foi resolvido durante a ligação.');
  if (pontos_positivos.length === 0) pontos_positivos.push('Atendimento dentro do padrão mínimo esperado.');

  if (houve_agressividade_atendente) {
    pontos_negativos.push('Atendente usou linguagem inadequada ou agressiva.');
    oportunidades_melhoria.push('Trabalhar o controle emocional sob situações de tensão.');
    treinamento_recomendado.push('Reciclagem urgente em Ética Profissional e Atendimento Humanizado.');
  }
  if (temImpaciencia && !houve_agressividade_atendente) {
    pontos_negativos.push('Atendente demonstrou sinais de impaciência durante a conversa.');
    oportunidades_melhoria.push('Praticar escuta ativa e evitar atalhos na comunicação com o cliente.');
    treinamento_recomendado.push('Treinamento em Inteligência Emocional no Atendimento.');
  }
  if (necessita_retorno && !problema_resolvido) {
    pontos_negativos.push('Ligação encerrada sem solução definitiva para o cliente.');
    oportunidades_melhoria.push('Acionar o nível de suporte correto ou escalonar quando necessário.');
    treinamento_recomendado.push('Fluxos de escalonamento e procedimentos de suporte técnico.');
  }
  if (houve_interrupcao) {
    pontos_negativos.push('Detectadas interrupções ou sobreposição de vozes na conversa.');
    oportunidades_melhoria.push('Aguardar o cliente concluir antes de responder.');
    treinamento_recomendado.push('Técnicas de Comunicação Assertiva e Escuta Ativa.');
  }
  if (pontos_negativos.length === 0) pontos_negativos.push('Nenhum desvio crítico de protocolo detectado.');
  if (oportunidades_melhoria.length === 0) oportunidades_melhoria.push('Manter o padrão de atendimento estabelecido.');
  if (treinamento_recomendado.length === 0) treinamento_recomendado.push('Treinamentos periódicos de atualização técnica e comercial.');

  const resumo_conversa =
    texto.length > 400 ? texto.substring(0, 400) + '...' : texto;

  return {
    resumo_conversa,
    assuntos_abordados,
    sentimento_cliente,
    sentimento_atendente,
    temperatura_conversa,
    tom_cliente,
    tom_atendente,
    houve_agressividade_cliente,
    houve_agressividade_atendente,
    houve_empatia,
    houve_cordialidade,
    houve_interrupcao,
    cliente_demonstrou_insatisfacao,
    cliente_ameacou_cancelar,
    cliente_mencionou_procon_anatel,
    cliente_mencionou_processo,
    problema_resolvido,
    necessita_retorno,
    risco_churn,
    risco_reclamacao,
    avaliacao_atendente: {
      cordialidade,
      empatia,
      clareza_comunicacao,
      dominio_assunto,
      conducao_conversa,
      resolucao_problema,
      cumprimento_protocolo,
      controle_emocional,
      experiencia_cliente,
      nota_final,
    },
    pontos_positivos,
    pontos_negativos,
    oportunidades_melhoria,
    treinamento_recomendado,
    classificacao_ligacao,
    status_monitoria,
    alerta_supervisao,
    motivo_alerta,
    confianca_transcricao,
    observacao_transcricao,
  };
}

// ============================================================
// MOTOR DE ANÁLISE OPENAI (quando OPENAI_API_KEY existe)
// ============================================================

async function analisarQualidadeOpenAI(texto) {
  const model = process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4.1-mini';
  console.log(`[JRC] Analisando qualidade com OpenAI (${model})...`);

  const { confianca_transcricao, observacao_transcricao } =
    detectarQualidadeTranscricao(texto);

  const systemPrompt = `Você é um agente sênior de monitoria de qualidade de call center da JRC. Sua função é analisar transcrições de ligações PABX entre cliente e atendente.

Você deve avaliar a conversa como um monitor humano experiente, considerando contexto, tom, sensação da conversa, postura do atendente, sentimento do cliente, resolução do problema, riscos operacionais e oportunidades de melhoria.

Não faça análise rasa por palavras-chave. Entenda a intenção, o clima emocional e o desfecho da conversa.

Diferencie cordialidade de satisfação. Diferencie encerramento educado de experiência positiva. Diferencie cliente calmo de cliente satisfeito. Diferencie atendente educado de atendimento resolutivo.

Quando os falantes não estiverem identificados, tente inferir cliente e atendente com cautela. Se não houver evidência suficiente, use nao_identificado e reduza a confiança da análise.

Não invente informações. Se algo não estiver claro na transcrição, sinalize incerteza.

Se a transcrição estiver confusa, repetitiva, incompleta ou incoerente, marque confianca_transcricao baixa e recomende revisão humana.

Sempre responda em JSON válido, sem markdown, sem texto fora do JSON.`;

  const userPrompt = `Analise a ligação abaixo como uma monitoria humanizada de qualidade de call center.

Retorne exclusivamente um JSON válido no schema solicitado.

Transcrição da ligação:
${texto}`;

  const response = await openai.responses.create({
    model,
    input: [
      {
        role: 'system',
        content: systemPrompt,
      },
      { 
        role: 'user', 
        content: userPrompt, 
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'analise_qualidade_pabx',
        schema: ANALISE_QUALIDADE_SCHEMA,
        strict: true,
      },
    },
  });

  const analise = JSON.parse(response.output_text);

  // ============================================================
  // PÓS-VALIDAÇÃO E NORMALIZAÇÃO DE CAMPOS (GARANTIAS DE INTEGRIDADE)
  // ============================================================
  
  // 1. Garantir que as notas estejam dentro dos limites permitidos
  const av = analise.avaliacao_atendente || {};
  av.cordialidade = Math.min(10, Math.max(0, parseInt(av.cordialidade) || 0));
  av.empatia = Math.min(10, Math.max(0, parseInt(av.empatia) || 0));
  av.clareza_comunicacao = Math.min(10, Math.max(0, parseInt(av.clareza_comunicacao) || 0));
  av.dominio_assunto = Math.min(10, Math.max(0, parseInt(av.dominio_assunto) || 0));
  av.conducao_conversa = Math.min(10, Math.max(0, parseInt(av.conducao_conversa) || 0));
  av.resolucao_problema = Math.min(15, Math.max(0, parseInt(av.resolucao_problema) || 0));
  av.cumprimento_protocolo = Math.min(10, Math.max(0, parseInt(av.cumprimento_protocolo) || 0));
  av.controle_emocional = Math.min(10, Math.max(0, parseInt(av.controle_emocional) || 0));
  av.experiencia_cliente = Math.min(15, Math.max(0, parseInt(av.experiencia_cliente) || 0));

  // Recalcular rigorosamente a nota final para evitar erro matemático da IA
  av.nota_final = av.cordialidade + av.empatia + av.clareza_comunicacao + 
                  av.dominio_assunto + av.conducao_conversa + av.resolucao_problema + 
                  av.cumprimento_protocolo + av.controle_emocional + av.experiencia_cliente;
  analise.nota_final = av.nota_final;
  analise.avaliacao_atendente = av;

  // 2. Garantir enums corretos
  const validasClassificacao = ['excelente', 'boa', 'regular', 'ruim', 'critica'];
  if (!validasClassificacao.includes(analise.classificacao_ligacao)) {
    analise.classificacao_ligacao = 'regular';
  }

  const validosStatus = ['aprovada', 'aprovada_com_observacao', 'reprovada', 'critica_para_supervisao'];
  if (!validosStatus.includes(analise.status_monitoria)) {
    analise.status_monitoria = 'aprovada';
  }

  const validasTemperaturas = ['fria', 'neutra', 'quente', 'critica'];
  if (!validasTemperaturas.includes(analise.temperatura_conversa)) {
    analise.temperatura_conversa = 'neutra';
  }

  const validasSensacoes = ['tranquila', 'objetiva', 'cordial', 'confusa', 'tensa', 'desgastante', 'insatisfeita', 'critica', 'inconclusiva'];
  if (!validasSensacoes.includes(analise.sensacao_conversa)) {
    analise.sensacao_conversa = 'objetiva';
  }

  // 3. Garantir que os campos de array de texto e objetos sejam válidos
  analise.assuntos_abordados = Array.isArray(analise.assuntos_abordados) ? analise.assuntos_abordados : [];
  analise.pontos_positivos = Array.isArray(analise.pontos_positivos) ? analise.pontos_positivos : [];
  analise.pontos_negativos = Array.isArray(analise.pontos_negativos) ? analise.pontos_negativos : [];
  analise.oportunidades_melhoria = Array.isArray(analise.oportunidades_melhoria) ? analise.oportunidades_melhoria : [];
  analise.treinamento_recomendado = Array.isArray(analise.treinamento_recomendado) ? analise.treinamento_recomendado : [];
  analise.trechos_relevantes = Array.isArray(analise.trechos_relevantes) ? analise.trechos_relevantes : [];

  // 4. Injetar metadados de transcrição gerados localmente
  analise.confianca_transcricao = confianca_transcricao;
  analise.observacao_transcricao = observacao_transcricao;

  return analise;
}

async function analisarQualidade(texto) {
  if (!TEM_OPENAI) {
    console.log('[JRC] OpenAI ausente. Usando motor local de regras.');
    return analisarQualidadeLocal(texto);
  }
  try {
    return await analisarQualidadeOpenAI(texto);
  } catch (err) {
    console.error('[JRC] Falha na análise OpenAI, usando motor local:', err.message);
    return analisarQualidadeLocal(texto);
  }
}

// ============================================================
// MÉTRICAS — calcular localmente sem depender de view SQL
// ============================================================

async function calcularMetricasLocalmente() {
  const { data, error } = await supabase
    .from('analises_qualidade_pabx')
    .select(
      'nota_final, alerta_supervisao, classificacao_ligacao, temperatura_conversa, risco_churn, risco_reclamacao, status_monitoria'
    );

  if (error) throw new Error(error.message);

  const total = data.length;
  const somaNotas = data.reduce((s, r) => s + (r.nota_final || 0), 0);
  const nota_media = total > 0 ? Math.round((somaNotas / total) * 10) / 10 : 0;

  const conta = (fn) => data.filter(fn).length;

  return {
    total_analisadas: total,
    nota_media,
    total_alertas_supervisao: conta((r) => r.alerta_supervisao),
    total_criticas: conta((r) => r.classificacao_ligacao === 'critica'),
    total_conversas_frias: conta((r) => r.temperatura_conversa === 'fria'),
    total_conversas_neutras: conta((r) => r.temperatura_conversa === 'neutra'),
    total_conversas_quentes: conta((r) => r.temperatura_conversa === 'quente'),
    total_conversas_criticas: conta((r) => r.temperatura_conversa === 'critica'),
    total_risco_churn_alto_critico: conta((r) => ['alto', 'critico'].includes(r.risco_churn)),
    total_risco_reclamacao_alto_critico: conta((r) => ['alto', 'critico'].includes(r.risco_reclamacao)),
    total_aprovadas: conta((r) => r.status_monitoria === 'aprovada'),
    total_aprovadas_com_observacao: conta((r) => r.status_monitoria === 'aprovada_com_observacao'),
    total_reprovadas: conta((r) => r.status_monitoria === 'reprovada'),
    total_criticas_para_supervisao: conta((r) => r.status_monitoria === 'critica_para_supervisao'),
  };
}

// ============================================================
// ROTAS
// ============================================================

// --- GET /api/health ---
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    projeto: 'JRC Voice Quality Analytics',
    versao: '2.0.0',
    modo: TEM_OPENAI ? 'openai' : 'open_source_local',
    openai_configurada: TEM_OPENAI,
    openai_base_url_customizada: TEM_BASE_URL,
    supabase_configurado: Boolean(
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
  });
});

// --- POST /api/processar-audio (com OpenAI) ---
app.post('/api/processar-audio', upload.single('audio'), async (req, res) => {
  let chamada = null;
  try {
    if (!TEM_OPENAI) {
      return res.status(400).json({
        sucesso: false,
        erro: 'OPENAI_API_KEY não configurada. Configure a chave no arquivo .env e reinicie o servidor. Para processar sem OpenAI, use o botão "Transcrever local Open Source".',
      });
    }

    if (!req.file) {
      return res.status(400).json({ sucesso: false, erro: 'Nenhum arquivo de áudio enviado.' });
    }

    console.log(`[JRC] Processando áudio via OpenAI: ${req.file.originalname}`);
    chamada = await registrarChamada(req.file.originalname);

    // Transcrição com OpenAI Whisper
    const modelTranscricao =
      process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';

    let textoTranscrito;
    try {
      const transcricaoResp = await openai.audio.transcriptions.create({
        model: modelTranscricao,
        file: fs.createReadStream(req.file.path),
        language: 'pt',
      });
      textoTranscrito = transcricaoResp.text;
    } catch (errTranscricao) {
      console.error('[JRC] Falha na transcrição OpenAI:', errTranscricao.message);
      throw new Error(`Falha na transcrição com OpenAI: ${errTranscricao.message}`);
    }

    await salvarTranscricao(chamada.id, textoTranscrito, modelTranscricao);

    // Análise de qualidade (OpenAI com fallback local automático)
    let analise;
    let modoAnalise = 'openai';
    try {
      analise = await analisarQualidadeOpenAI(textoTranscrito);
    } catch (errAnalise) {
      console.error('[JRC] Falha na análise OpenAI, usando motor local:', errAnalise.message);
      analise = analisarQualidadeLocal(textoTranscrito);
      modoAnalise = 'open_source_local_fallback';
    }

    analise.texto_transcrito = textoTranscrito;
    await salvarAnaliseQualidade(chamada.id, analise);
    await atualizarStatus(chamada.id, 'concluido');

    res.json({
      sucesso: true,
      modo: modoAnalise,
      aviso: modoAnalise === 'open_source_local_fallback'
        ? 'A transcrição foi feita pela OpenAI, mas a análise de qualidade usou o motor local (fallback) por falha na OpenAI.'
        : undefined,
      chamada_id: chamada.id,
      call_id: chamada.call_id,
      arquivo: req.file.originalname,
      transcricao: textoTranscrito,
      analise_qualidade: analise,
    });
  } catch (err) {
    console.error('[JRC] Erro processar-audio:', err.message);
    if (chamada?.id) await atualizarStatus(chamada.id, 'erro');
    res.status(500).json({ sucesso: false, erro: err.message });
  } finally {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
  }
});

// --- POST /api/processar-transcricao (Whisper local) ---
app.post('/api/processar-transcricao', async (req, res) => {
  let chamada = null;
  try {
    const { arquivo_audio, texto_transcrito } = req.body;

    if (!texto_transcrito || texto_transcrito.trim().length === 0) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Campo texto_transcrito é obrigatório e não pode ser vazio.',
      });
    }

    console.log(`[JRC] Processando transcrição local: ${arquivo_audio || 'sem nome'}`);
    const nomeArquivo = arquivo_audio || `transcricao-local-${Date.now()}.txt`;

    chamada = await registrarChamada(nomeArquivo);
    await salvarTranscricao(chamada.id, texto_transcrito, 'whisper-local-browser');

    const analise = await analisarQualidade(texto_transcrito);
    analise.texto_transcrito = texto_transcrito;
    await salvarAnaliseQualidade(chamada.id, analise);
    await atualizarStatus(chamada.id, 'concluido');

    res.json({
      sucesso: true,
      modo: TEM_OPENAI ? 'openai' : 'open_source_local',
      chamada_id: chamada.id,
      call_id: chamada.call_id,
      arquivo: nomeArquivo,
      transcricao: texto_transcrito,
      analise_qualidade: analise,
    });
  } catch (err) {
    console.error('[JRC] Erro processar-transcricao:', err.message);
    if (chamada?.id) await atualizarStatus(chamada.id, 'erro');
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// --- GET /api/qualidade ---
app.get('/api/qualidade', async (_req, res) => {
  try {
    // Tenta usar a view unificada; faz select manual como fallback
    const { data, error } = await supabase
      .from('vw_qualidade_pabx_dashboard')
      .select('*')
      .order('analise_criada_em', { ascending: false })
      .limit(50);

    if (error) {
      // Fallback: join manual
      const { data: fallback, error: errFb } = await supabase
        .from('analises_qualidade_pabx')
        .select(`
          *,
          chamadas_pabx (call_id, arquivo_audio, telefone_origem, ramal, agente, fila, data_chamada, status),
          transcricoes_pabx (texto_transcrito, modelo_transcricao)
        `)
        .order('criado_em', { ascending: false })
        .limit(50);

      if (errFb) throw new Error(errFb.message);
      return res.json(fallback || []);
    }

    res.json(data || []);
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// --- GET /api/qualidade/criticas ---
app.get('/api/qualidade/criticas', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('analises_qualidade_pabx')
      .select(`
        *,
        chamadas_pabx (call_id, arquivo_audio, data_chamada, agente)
      `)
      .or(
        'alerta_supervisao.eq.true,classificacao_ligacao.eq.critica,temperatura_conversa.eq.critica,risco_churn.eq.alto,risco_churn.eq.critico,risco_reclamacao.eq.alto,risco_reclamacao.eq.critico'
      )
      .order('criado_em', { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// --- GET /api/qualidade/metricas ---
app.get('/api/qualidade/metricas', async (_req, res) => {
  try {
    // Tenta usar view SQL; faz cálculo local como fallback
    const { data, error } = await supabase
      .from('vw_qualidade_pabx_metricas')
      .select('*')
      .single();

    if (error) {
      const metricas = await calcularMetricasLocalmente();
      return res.json(metricas);
    }

    // Normalizar campos da view (podem vir como strings do postgres)
    res.json({
      total_analisadas: Number(data.total_analisadas) || 0,
      nota_media: Number(data.nota_media) || 0,
      total_alertas_supervisao: Number(data.total_alertas_supervisao) || 0,
      total_criticas: Number(data.total_criticas) || 0,
      total_conversas_frias: Number(data.total_conversas_frias) || 0,
      total_conversas_neutras: Number(data.total_conversas_neutras) || 0,
      total_conversas_quentes: Number(data.total_conversas_quentes) || 0,
      total_conversas_criticas: Number(data.total_conversas_criticas) || 0,
      total_risco_churn_alto_critico: Number(data.total_risco_churn_alto_critico) || 0,
      total_risco_reclamacao_alto_critico: Number(data.total_risco_reclamacao_alto_critico) || 0,
      total_aprovadas: Number(data.total_aprovadas) || 0,
      total_aprovadas_com_observacao: Number(data.total_aprovadas_com_observacao) || 0,
      total_reprovadas: Number(data.total_reprovadas) || 0,
      total_criticas_para_supervisao: Number(data.total_criticas_para_supervisao) || 0,
    });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   JRC Voice Quality Analytics v2.0.0    ║');
  console.log(`  ║   http://localhost:${PORT}                    ║`);
  console.log(`  ║   Modo: ${TEM_OPENAI ? 'OpenAI + Motor Local     ' : 'Motor Local (sem OpenAI)  '}║`);
  if (TEM_BASE_URL) {
  console.log('  ║   OpenAI baseURL: customizada            ║');
  }
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
});
