// Sineta: avisos locais nos canais de ação e de conversa.
"use strict";

if (require.main === module) {
  process.on("uncaughtException", () => process.exit(0));
  process.on("unhandledRejection", () => process.exit(0));
}

const fs = require("fs");
const crypto = require("crypto");
const { pastaLocal } = require("./pasta-local.js");
const path = require("path");
const { casar, casarFala, normalizar } = require("./casar.js");

const TETO_POR_SESSAO = 24;          // toques totais; PreCompact re-arma os livros
const COOLDOWN_MS = 45 * 60 * 1000;  // o livro fica "na mão" por 45min
const FALA_INTERVALO_MS = 120 * 1000; // canal fala: no máx 1 toque a cada 2min
const JANELA_FALA_CHARS = 9000;      // quanto de fala recente é considerado
const LEITURA_MAX_BYTES = 768 * 1024; // nunca ler mais que isso do transcript por vez
const LOCK_TENTATIVAS = 80;             // até ~2s: preserva evento distinto sem prender a ferramenta
const LOCK_RETRY_MS = 25;

function lerStdin() {
  return new Promise((resolve) => {
    let dados = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (p) => (dados += p));
    process.stdin.on("end", () => resolve(dados));
    process.stdin.on("error", () => resolve(""));
  });
}

function lerState(statePath) {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch (_) {}
  if (typeof s !== "object" || s === null) s = {};
  // migração do formato v1 (fired era array) → v2 (mapa id→timestamp)
  if (Array.isArray(s.fired)) {
    const m = {};
    for (const id of s.fired) m[id] = Date.now();
    s.fired = m;
  }
  if (typeof s.fired !== "object" || s.fired === null) s.fired = {};
  if (typeof s.toques !== "number") s.toques = Object.keys(s.fired).length;
  if (typeof s.ultimaFala !== "number") s.ultimaFala = 0;
  if (typeof s.transcripts !== "object" || s.transcripts === null || Array.isArray(s.transcripts)) {
    s.transcripts = {};
  }
  return s;
}

function migrarCooldown(state, indice) {
  // Os estados antigos usavam o número do livro, que pode apontar para dois caminhos.
  for (const [id, timestamp] of Object.entries(state.fired)) {
    if (id.includes("/")) continue;
    const caminhos = new Set();
    for (const canal of [indice.sentinelas || [], indice.falas || []]) {
      for (const entrada of canal) {
        if (entrada.id === id) caminhos.add(entrada.path);
      }
    }
    if (caminhos.size === 1 && Number.isFinite(timestamp)) {
      const [caminho] = caminhos;
      state.fired[caminho] = Math.max(state.fired[caminho] || 0, timestamp);
    }
    delete state.fired[id];
  }
}

function naMao(state, caminho, agora) {
  const ts = state.fired[caminho];
  return typeof ts === "number" && agora - ts < COOLDOWN_MS;
}

function chaveEstado(session) {
  return crypto.createHash("sha256")
    .update(String(session))
    .digest("hex").slice(0, 32);
}

function chaveTranscript(transcriptPath) {
  return crypto.createHash("sha256")
    .update(String(transcriptPath || "sem-transcript"))
    .digest("hex").slice(0, 32);
}

function obterCursor(state, transcriptPath) {
  const chave = chaveTranscript(transcriptPath);
  if (!state.transcripts[chave] || typeof state.transcripts[chave] !== "object") {
    state.transcripts[chave] = { offset: 0, janela: "" };
  }
  const cursor = state.transcripts[chave];
  if (typeof cursor.offset !== "number") cursor.offset = 0;
  if (typeof cursor.janela !== "string") cursor.janela = "";
  return cursor;
}

// Codex pode disparar vários PreToolUse em paralelo. A identidade publicada
// abaixo impede dois processos de lerem o mesmo cooldown antes da persistência.
function processoVivo(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (erro) {
    return !(erro && erro.code === "ESRCH");
  }
}

function donoVivo(dono) {
  return Boolean(dono && processoVivo(dono.pid));
}

function lerDonoLock(lockPath) {
  try {
    const bruto = fs.readFileSync(lockPath);
    const dono = JSON.parse(bruto.toString("utf8"));
    if (!dono || dono.schema !== 1 || !Number.isSafeInteger(dono.pid) ||
        typeof dono.token !== "string" || !/^[a-f0-9-]{32,64}$/i.test(dono.token)) {
      return { bruto, dono: null };
    }
    return { bruto, dono };
  } catch (_) {
    return null;
  }
}

// Captura por hard-link a identidade exata do lock observado. Assim, se outro
// processo liberar e readquirir o nome entre a inspecao e a limpeza, o coletor
// nunca apaga o novo dono (problema ABA). Nao ha TTL nem relogio de parede:
// somente um PID comprovadamente morto torna o lock recuperavel. Reuso de PID
// preserva conservadoramente o lock antigo: perde aviso, mas nunca concorrencia.
async function removerLockOrfao(lockPath) {
  const claimPath = lockPath + ".claim." + process.pid + "." + crypto.randomUUID();
  const limparClaim = () => { try { fs.unlinkSync(claimPath); } catch (_) {} };
  try {
    fs.linkSync(lockPath, claimPath);
    process.once("exit", limparClaim);
  } catch (_) {
    return false;
  }

  try {
    const observado = lerDonoLock(claimPath);
    if (!observado) return false;
    if (observado.dono && donoVivo(observado.dono)) return false;

    const atual = lerDonoLock(lockPath);
    if (!atual || observado.bruto.length !== atual.bruto.length ||
        !crypto.timingSafeEqual(observado.bruto, atual.bruto)) return false;
    try {
      fs.unlinkSync(lockPath);
      return true;
    } catch (_) {
      return false;
    }
  } catch (_) {
    return false;
  } finally {
    limparClaim();
    process.removeListener("exit", limparClaim);
  }
}

// O hard-link publica de forma atomica um dono completo (PID + token unico),
// e o token impede que um processo libere lock alheio. Contencao tem retry
// curto e continua fail-open.
async function adquirirLock(lockBase) {
  const token = crypto.randomUUID();
  const candidato = lockBase + ".candidate." + process.pid + "." + token;
  const limparCandidato = () => { try { fs.unlinkSync(candidato); } catch (_) {} };
  try {
    fs.writeFileSync(candidato, JSON.stringify({
      schema: 1, pid: process.pid, token,
    }), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    process.once("exit", limparCandidato);
  } catch (_) {
    return false;
  }

  let adquirido = false;
  function liberar() {
    if (!adquirido) return;
    try {
      const atual = lerDonoLock(lockBase);
      if (atual && atual.dono && atual.dono.pid === process.pid && atual.dono.token === token) {
        fs.unlinkSync(lockBase);
      }
    } catch (_) {}
    adquirido = false;
  }

  for (let tentativa = 0; tentativa < LOCK_TENTATIVAS; tentativa++) {
    try {
      fs.linkSync(candidato, lockBase);
      adquirido = true;
      process.once("exit", liberar);
      limparCandidato();
      process.removeListener("exit", limparCandidato);
      return true;
    } catch (erro) {
      if (erro && erro.code === "EEXIST" &&
          await removerLockOrfao(lockBase)) continue;
      if (tentativa + 1 < LOCK_TENTATIVAS) {
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
      }
    }
  }
  limparCandidato();
  process.removeListener("exit", limparCandidato);
  return false;
}

function extrairFalaObservavel(ev, state) {
  // Codex rollout: somente mensagens observáveis de user/assistant. Reasoning,
  // developer/system, tool inputs/outputs e demais response_item ficam de fora.
  if (ev && ev.type === "response_item" && ev.payload && ev.payload.type === "message") {
    const msg = ev.payload;
    if (msg.role !== "user" && msg.role !== "assistant") return [];
    if (!Array.isArray(msg.content)) return [];
    const tipoPermitido = msg.role === "user" ? "input_text" : "output_text";
    return msg.content
      .filter((item) => item && item.type === tipoPermitido && typeof item.text === "string")
      .map((item) => item.text);
  }

  // Claude transcript: a fala está em ev.message. Conteúdo de ferramenta não
  // tem type=text e, portanto, nunca entra na janela.
  if (ev && (ev.isMeta === true || ev.isSidechain === true)) return [];
  const msg = ev && ev.message;
  if (!msg || (msg.role !== "user" && msg.role !== "assistant")) return [];
  if (typeof msg.content === "string") return [msg.content];
  if (!Array.isArray(msg.content)) return [];
  return msg.content
    .filter((item) => item && item.type === "text" && typeof item.text === "string")
    .map((item) => item.text);
}

// Lê SÓ os bytes novos do transcript desde a última olhada e devolve a fala
// recente (texto dito pelo agente + o que o usuário pediu), já normalizada.
// Quando fornecido, `leitura` recebe somente a fala nova normalizada; ele é
// local à chamada e nunca entra no state/log.
function lerFalaRecente(transcriptPath, cursor, state, leitura) {
  if (leitura && typeof leitura === "object") leitura.nova = "";
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return "";
    const stat = fs.statSync(transcriptPath);
    if (!stat.isFile()) return "";
    const tam = stat.size;
    let inicio = cursor.offset;
    if (inicio > tam) inicio = 0;                       // arquivo rotacionou/encolheu
    const cortouInicio = tam - inicio > LEITURA_MAX_BYTES;
    if (cortouInicio) inicio = tam - LEITURA_MAX_BYTES;
    if (tam - inicio <= 0) { cursor.offset = tam; return ""; }

    const fd = fs.openSync(transcriptPath, "r");
    const buf = Buffer.alloc(tam - inicio);
    let bytesLidos = 0;
    try {
      bytesLidos = fs.readSync(fd, buf, 0, buf.length, inicio);
    } finally {
      try { fs.closeSync(fd); } catch (_) {}
    }
    const dados = buf.subarray(0, bytesLidos);
    if (!dados.length) return "";

    // JSONL pode ser observado enquanto o CLI ainda escreve a ultima linha.
    // O cursor avanca somente por bytes terminados em LF; o tail parcial e
    // relido na proxima chamada, sem ser persistido no state.
    let inicioParse = 0;
    if (cortouInicio) {
      const primeiroLf = dados.indexOf(0x0a);
      if (primeiroLf < 0) return "";
      inicioParse = primeiroLf + 1; // fragmento anterior ao cap nao e uma linha completa
      cursor.offset = inicio + inicioParse;
    }
    const ultimoLf = dados.lastIndexOf(0x0a);
    if (ultimoLf < inicioParse) return "";
    cursor.offset = inicio + ultimoLf + 1;

    const pedacos = [];
    const completas = dados.subarray(inicioParse, ultimoLf + 1);
    for (const linha of completas.toString("utf8").split("\n")) {
      const l = linha.trim();
      if (!l || l[0] !== "{") continue;
      let ev;
      try { ev = JSON.parse(l); } catch (_) { continue; }
      pedacos.push(...extrairFalaObservavel(ev, state));
    }
    const nova = normalizar(pedacos.join(" "));
    if (!nova) return "";
    if (leitura && typeof leitura === "object") leitura.nova = nova;
    const janela = ((cursor.janela || "") + " " + nova).slice(-JANELA_FALA_CHARS);
    cursor.janela = janela;
    return janela;
  } catch (_) {
    return "";
  }
}

function livroAbsoluto(entrada) {
  try {
    const raiz = pastaLocal();
    const livro = path.resolve(raiz, String(entrada.path || ""));
    if (!livro.startsWith(path.join(raiz, "biblioteca") + path.sep)) return "";
    return fs.existsSync(livro) ? livro : "";
  } catch (_) {
    return "";
  }
}

function tocar(state, statePath, entrada, canal) {
  state.fired[entrada.path] = Date.now();
  state.toques++;
  try { fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 }); } catch (_) {}

  const livro = livroAbsoluto(entrada);
  if (!livro) process.exit(0);
  const licao = entrada.licao || entrada.aviso || "";
  const digest = entrada.digest ? " — TRECHO: " + entrada.digest : "";
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext:
        "🔔 SINETA [" + entrada.id + "·" + canal + "]:" + (licao ? " " + licao : "") + digest +
        " — livro: " + livro +
        " — Confira quando a lição se aplica a esta tarefa.",
    },
  }));
  process.exit(0);
}

async function main() {
  if (process.env.ODYSSEY_SINETA_OFF === "1") process.exit(0);
  const raiz = pastaLocal();
  if (fs.existsSync(path.join(raiz, "OFF"))) return;

  const evento = JSON.parse(await lerStdin());
  if (!["PreToolUse", "PreCompact"].includes(evento.hook_event_name) || !evento.session_id) return;
  const stateKey = chaveEstado(String(evento.session_id));
  const stateDir = path.join(raiz, "estado");
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const statePath = path.join(stateDir, "sineta-" + stateKey + ".json");
  if (!(await adquirirLock(statePath + ".lock"))) process.exit(0);
  const state = lerState(statePath);
  // PreCompact: a memória do agente vai ser resumida → os livros injetados
  // podem evaporar do contexto. Todos voltam pra prateleira (re-armar).
  if (evento.hook_event_name === "PreCompact") {
    state.fired = {};
    state.toques = 0;
    state.ultimaFala = 0;
    try { fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 }); } catch (_) {}
    process.exit(0);
  }

  let tool = evento.tool_name;
  let input = evento.tool_input || {};
  if (tool === "exec_command" || tool === "shell_command") {
    tool = "Bash";
    input = { command: input.cmd || input.command || "" };
  } else if (tool === "apply_patch") {
    input = { command: typeof input === "string" ? input : input.command || input.patch || input.input || "" };
  }
  const agora = Date.now();

  if (state.toques >= TETO_POR_SESSAO) process.exit(0);

  const indice = JSON.parse(fs.readFileSync(path.join(raiz, "sentinelas.json"), "utf8"));
  migrarCooldown(state, indice);

  // ---- canal MÃO primeiro (precisão máxima: a ação perigosa em si) ----
  for (const s of indice.sentinelas || []) {
    if (naMao(state, s.path, agora)) continue;
    if (!casar(s, tool, input, evento.cwd)) continue;
    tocar(state, statePath, s, "mao");
  }

  // ---- canal FALA (a intenção dita no transcript) ----
  const cursor = obterCursor(state, evento.transcript_path);
  if (agora - state.ultimaFala < FALA_INTERVALO_MS) {
    try { fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 }); } catch (_) {}
    process.exit(0);
  }
  const janelaAnterior = cursor.janela || "";
  const leitura = { nova: "" };
  const janela = lerFalaRecente(evento.transcript_path, cursor, state, leitura);
  if (janela) {
    let melhor = null;
    for (const f of indice.falas || []) {
      if (naMao(state, f.path, agora)) continue;
      const r = casarFala(f, janela);
      if (!r.hit) continue;
      // A janela antiga serve para completar uma intenção que cruzou eventos,
      // não para ciclar outros livros a cada append neutro. Repetição explícita
      // continua válida quando a fala nova, sozinha, também casa.
      if (casarFala(f, janelaAnterior).hit && !casarFala(f, leitura.nova).hit) continue;
      const forca = r.motivo === "regex" ? 3 : r.motivo === "raro" ? 2 : r.termos.length >= 3 ? 2 : 1;
      if (!melhor || forca > melhor.forca) melhor = { f, r, forca };
    }
    if (melhor) {
      state.ultimaFala = agora;
      tocar(state, statePath, melhor.f, "fala");
    }
  }

  // sem match: persiste offset/janela pra próxima chamada ser barata
  try { fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 }); } catch (_) {}
  process.exit(0);
}

if (require.main === module) main().catch(() => process.exit(0));

module.exports = {
  adquirirLock,
  chaveEstado,
  chaveTranscript,
  extrairFalaObservavel,
  lerFalaRecente,
  livroAbsoluto,
  obterCursor,
  main,
};
