# JRC Voice Quality Analytics — V2.0.0

> Monitoria automática de qualidade para ligações PABX com IA local (Whisper no navegador) e OpenAI opcional.

---

## 🎯 Objetivo do Projeto

Ferramenta independente de monitoria automática de qualidade para call centers e operações de PABX.

**O que o sistema faz:**
- Upload manual de áudio de ligação
- Transcrição via Whisper local (browser) ou OpenAI Whisper (server)
- Análise de qualidade com motor de regras local ou GPT-4.1-mini
- Identificação de sentimentos, temperatura, riscos, comportamentos
- Pontuação do atendente (0 a 100) com critérios detalhados
- Alerta automático para supervisão
- Dashboard com métricas e histórico completo

---

## ⚙️ Configuração

### 1. Copie o arquivo de variáveis de ambiente

```bash
cp .env.example .env
```

### 2. Preencha o `.env`

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role

# OpenAI — deixe OPENAI_API_KEY vazio para usar somente motor local
OPENAI_API_KEY=

# Opcional: gateway/proxy compatível com OpenAI (deixar vazio para API oficial)
OPENAI_BASE_URL=

OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_ANALYSIS_MODEL=gpt-4.1-mini

PORT=3000
```

> ⚠️ **Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` ou `OPENAI_API_KEY` no frontend. Essas chaves ficam somente no backend.**

---

## 📦 Instalação

```bash
npm install
```

---

## 🚀 Rodar em desenvolvimento

```bash
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

---

## 🗄️ Configurar o Banco de Dados (Supabase)

Copie o conteúdo de `supabase/schema_v2.sql` e execute **manualmente** no Supabase SQL Editor:

1. Acesse o painel do Supabase
2. Clique em **SQL Editor**
3. Cole o conteúdo do arquivo `supabase/schema_v2.sql`
4. Clique em **Run**

O script é seguro para reexecutar (`IF NOT EXISTS`, sem `DROP TABLE`).

**Tabelas criadas:**
- `chamadas_pabx` — registro de cada ligação processada
- `transcricoes_pabx` — texto transcrito de cada ligação
- `analises_sentimento_pabx` — análise V1 (mantida para compatibilidade)
- `analises_qualidade_pabx` — análise V2 (tabela principal)

**Views criadas:**
- `vw_qualidade_pabx_dashboard` — dados unificados para o dashboard
- `vw_qualidade_pabx_metricas` — agregações de KPIs

---

## 🧪 Como Testar

### 1. Verificar status do servidor

```bash
curl http://localhost:3000/api/health
```

Resposta esperada (sem OpenAI configurada):
```json
{
  "status": "online",
  "projeto": "JRC Voice Quality Analytics",
  "versao": "2.0.0",
  "modo": "open_source_local",
  "openai_configurada": false,
  "openai_base_url_customizada": false,
  "supabase_configurado": true
}
```

Resposta esperada (com OpenAI configurada, API oficial):
```json
{
  "modo": "openai",
  "openai_configurada": true,
  "openai_base_url_customizada": false,
  "supabase_configurado": true
}
```

### 2. Testar transcrição local (sem OpenAI)

1. Abra [http://localhost:3000](http://localhost:3000)
2. Selecione um arquivo `.mp3`, `.wav` ou `.m4a`
3. Escolha o modelo Whisper desejado
4. Clique em **"Transcrever local Open Source"**
5. Aguarde o download do modelo (na primeira vez) e a transcrição
6. O resultado aparece no painel de auditoria com nota, classificação e detalhes

### 3. Testar com OpenAI (se configurada)

1. Adicione a `OPENAI_API_KEY` no `.env` e reinicie o servidor
2. O botão **"Processar com OpenAI"** ficará visível na interface
3. Selecione o áudio e clique no botão

---

## 🔀 Fluxo de Processamento

```
Áudio (.mp3/.wav/.m4a)
  ↓
Whisper local (navegador)
  ↓
POST /api/processar-transcricao
  ↓
Motor de análise local por regras (ou OpenAI se configurada)
  ↓
Salva em chamadas_pabx + transcricoes_pabx + analises_qualidade_pabx
  ↓
Dashboard atualiza métricas e histórico
```

---

## 📐 Critérios de Nota (0 a 100)

| Critério             | Máximo |
|----------------------|--------|
| Cordialidade         | 10 |
| Empatia              | 10 |
| Clareza na Comunicação | 10 |
| Domínio do Assunto   | 10 |
| Condução da Conversa | 10 |
| Resolução de Problema | 15 |
| Cumprimento de Protocolo | 10 |
| Controle Emocional   | 10 |
| Experiência do Cliente | 15 |
| **TOTAL**            | **100** |

---

## 📊 Regras de Classificação

| Nota        | Classificação | Status         |
|-------------|---------------|----------------|
| ≥ 90        | Excelente     | Aprovada       |
| 75 a 89     | Boa           | Aprovada / Com Observação |
| 60 a 74     | Regular       | Aprovada com Observação |
| 40 a 59     | Ruim          | Reprovada      |
| < 40 ou alerta grave | Crítica | Crítica para Supervisão |

---

## 🌡️ Temperatura da Conversa

| Temperatura | Significado |
|-------------|-------------|
| `fria`      | Tranquila, sem tensão, sem risco |
| `neutra`    | Comum, sem sinais fortes |
| `quente`    | Insatisfação, irritação, tensão |
| `critica`   | Ameaça de cancelamento, Procon, Anatel, agressão, falha grave |

---

## ⚠️ Notas Importantes

- **OpenAI é opcional.** O sistema funciona 100% sem `OPENAI_API_KEY` usando o motor local de regras e o Whisper rodando no navegador do usuário.
- **Para produção**, recomenda-se usar transcrição server-side (OpenAI Whisper ou equivalente) para maior confiabilidade e suporte a áudios longos.
- **Segurança:** As chaves `SUPABASE_SERVICE_ROLE_KEY` e `OPENAI_API_KEY` ficam exclusivamente no backend (`.env`). O frontend nunca acessa essas chaves diretamente.

---

## 🚨 Possíveis Erros e Soluções

| Erro | Causa | Solução |
|------|-------|---------|
| `Variáveis obrigatórias ausentes no .env` | `.env` não configurado | Criar `.env` a partir do `.env.example` e preencher |
| `relation "chamadas_pabx" does not exist` | SQL não executado | Executar `supabase/schema_v2.sql` no Supabase |
| Whisper não retorna texto | Áudio incompatível ou modelo muito pequeno | Usar `whisper-small` e verificar o formato do áudio |
| `OPENAI_API_KEY não configurada` | Chave ausente | Adicionar a chave no `.env` ou usar o modo local |
| Métricas mostram `—` | Supabase não conectado | Verificar `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` |

---

## 📁 Estrutura de Arquivos

```
jrc-analytics/
├── index.js                   # Backend Express
├── package.json               # Dependências e scripts
├── .env                       # Variáveis de ambiente (não versionar)
├── .env.example               # Template de variáveis
├── .gitignore                 # Ignora node_modules, .env, uploads
├── README.md                  # Esta documentação
├── public/
│   └── index.html             # Frontend completo (HTML/CSS/JS)
├── supabase/
│   └── schema_v2.sql          # SQL para executar no Supabase
└── uploads/                   # Pasta temporária de áudios (auto-limpa)
```

---

## 🔑 Configurando OpenAI

No arquivo `.env`, preencha as variáveis conforme o cenário:

### Modo local gratuito (sem OpenAI)

Deixe `OPENAI_API_KEY` vazio. O Whisper roda no navegador e a análise usa motor de regras offline.

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=
```

### API oficial da OpenAI

Preencha `OPENAI_API_KEY` e deixe `OPENAI_BASE_URL` **vazio**.

```env
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=
```

### Gateway ou proxy compatível com OpenAI

Preencha ambos. Isso funciona com Azure OpenAI, LiteLLM, OpenRouter, etc.

```env
OPENAI_API_KEY=sua_chave_do_gateway
OPENAI_BASE_URL=https://sua-url-customizada/v1
```

### Após alterar o `.env`

```bash
npm run dev
```

Verifique em: `http://localhost:3000/api/health`

Resposta esperada com OpenAI + API oficial:
```json
{
  "modo": "openai",
  "openai_configurada": true,
  "openai_base_url_customizada": false,
  "supabase_configurado": true
}
```

Resposta esperada com gateway/proxy:
```json
{
  "modo": "openai",
  "openai_configurada": true,
  "openai_base_url_customizada": true,
  "supabase_configurado": true
}
```

> ⚠️ **Segurança:** `OPENAI_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY` ficam **somente** no `.env` do backend.
> O frontend nunca acessa essas chaves. Não as commite no repositório.

---

## 🔜 Próximos Passos para Produção

1. **Servidor:** Fazer deploy em Railway, Render, DigitalOcean ou AWS EC2
2. **Transcrição server-side:** Usar OpenAI Whisper API ou AssemblyAI para processar áudios no servidor
3. **Autenticação:** Adicionar login/JWT para proteger os endpoints
4. **Agente:** Filtros por agente, ramal, fila e período na tabela histórica
5. **Exportação:** Botão para exportar análises como CSV ou PDF
6. **Webhooks:** Enviar alertas por email ou Slack quando `alerta_supervisao = true`
7. **HTTPS:** Configurar SSL/TLS no servidor de produção

---

*JRC Voice Quality Analytics — Desenvolvido para monitoria inteligente de call centers.*
