// Gera o índice a partir dos livros Markdown da biblioteca local.
"use strict";

const fs = require("fs");
const path = require("path");
const { normalizar } = require("./casar.js");

const { randomUUID } = require("node:crypto");
const { pastaLocal } = require("./pasta-local.js");

const DIGEST_MAX = 380;   // chars do trecho que "voa" junto com o aviso
const DF_TERMO = 5;       // termo aparece em ≤5 livros → vale como termo

// Palavras comuns de PT + jargão onipresente do próprio sistema (aparecem em
// quase todo carregar-quando e não distinguem assunto nenhum).
const STOPWORDS = new Set((
  "de da do das dos a o as os e ou um uma uns umas para pra pro por com sem em no na nos nas " +
  "ao aos que quando antes depois sobre entre como se seu sua seus suas ser ter esta este isso " +
  "essa esse ja nao mais menos muito pode deve todo toda cada onde qual quais tipo ainda so " +
  "porque tambem outro outra algo alguem nada tudo fica ficar vai foi era sao esta estao " +
  "precisa preciso dentro fora contra desde ate apos sempre nunca caso coisa coisas fazer feito " +
  "agente agentes sessao sessoes biblioteca livro livros " +
  "quiser decidir decisao projeto tarefa trabalho hora momento"
).split(/\s+/));

function listarMd(dir) {
  const achados = [];
  const entradas = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entradas) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) achados.push(...listarMd(abs));
    else if (e.isFile() && e.name.endsWith(".md")) achados.push(abs);
  }
  return achados;
}

function extrairFrontmatter(texto) {
  const linhas = texto.split(/\r?\n/);
  if ((linhas[0] || "").trim() !== "---") return null;
  const fim = linhas.indexOf("---", 1);
  if (fim === -1) return null;
  return { fm: linhas.slice(1, fim), corpo: linhas.slice(fim + 1).join("\n") };
}

function parsearCampos(linhas) {
  const campos = {};
  const reAspas = /^([A-Za-z0-9_-]+):\s*"(.*)"\s*$/;
  const reNu = /^([A-Za-z0-9_-]+):\s*([^"\[\s].*?)\s*$/;
  for (const linha of linhas) {
    let m = reAspas.exec(linha);
    if (m) { campos[m[1]] = m[2].replace(/\\(["\\])/g, "$1"); continue; }
    m = reNu.exec(linha);
    if (m) campos[m[1]] = m[2];
  }
  return campos;
}

// O trecho que voa: primeiro conteúdo de prosa do corpo, sem sintaxe pesada de md.
function extrairDigest(corpo) {
  const linhas = corpo.split(/\r?\n/);
  const uteis = [];
  for (const l of linhas) {
    const t = l.trim();
    if (!t) { if (uteis.join(" ").length >= 120) break; else continue; }
    if (/^(#|>|\||```|---|\!\[)/.test(t)) continue; // pula heading/tabela/código
    uteis.push(t.replace(/\*\*?|__|`/g, ""));
    if (uteis.join(" ").length >= DIGEST_MAX) break;
  }
  let d = uteis.join(" ").replace(/\s+/g, " ").trim();
  if (d.length > DIGEST_MAX) d = d.slice(0, DIGEST_MAX - 1) + "…";
  return d;
}

// Candidatos a termo: do carregar-quando + do nome do arquivo (título).
function candidatos(cq, nomeArquivo) {
  const titulo = nomeArquivo.replace(/^[0-9.]+-/, "").replace(/\.md$/, "");
  const bruto = normalizar(cq + " " + titulo.replace(/-/g, " ") + " " + titulo);
  const tokens = bruto.split(/[^a-z0-9-]+/);
  const set = new Set();
  for (const t of tokens) {
    if (t.length < 5) continue;
    if (STOPWORDS.has(t)) continue;
    if (/^\d+$/.test(t)) continue;
    set.add(t);
  }
  return [...set];
}

function compilar(raiz) {
  const arquivos = listarMd(path.join(raiz, "biblioteca"));
  const brutos = [];
  for (const abs of arquivos) {
    const parsed = extrairFrontmatter(fs.readFileSync(abs, "utf8"));
    if (!parsed) continue;
    const c = parsearCampos(parsed.fm);
    const rel = path.relative(raiz, abs).split(path.sep).join("/");
    brutos.push({ abs, rel, c, corpo: parsed.corpo, nome: path.basename(abs) });
  }

  // ---- canal MÃO (inalterado no formato) ----
  const sentinelas = [];
  for (const b of brutos) {
    if (!b.c["sentinela-ferramentas"]) continue;
    sentinelas.push({
      id: b.c["id"] || b.rel,
      path: b.rel,
      licao: b.c["licao"] || "",
      ferramentas: b.c["sentinela-ferramentas"],
      comando: b.c["sentinela-comando"] || "",
      arquivo: b.c["sentinela-arquivo"] || "",
      aviso: b.c["sentinela-aviso"] || b.c["licao"] || "",
      digest: extrairDigest(b.corpo),
      deveCasar: (b.c["sentinela-deve-casar"] || "").split(" ;; ").map((f) => f.trim()).filter(Boolean),
    });
  }

  // ---- canal FALA (biblioteca inteira) ----
  // 1ª passada: candidatos por livro; 2ª: document frequency pra filtrar genéricos.
  const porLivro = [];
  const df = new Map();
  for (const b of brutos) {
    const cq = b.c["carregar-quando"] || "";
    if (!cq || b.c["sentinela-fala-off"] === "true") { porLivro.push(null); continue; }
    const cands = candidatos(cq, b.nome);
    porLivro.push(cands);
    for (const t of new Set(cands)) df.set(t, (df.get(t) || 0) + 1);
  }
  const falas = [];
  brutos.forEach((b, i) => {
    const cands = porLivro[i];
    if (!cands) return;
    const termos = [];
    const rarosDeclarados = String(b.c["sentinela-fala-raro"] || "")
      .split(" ;; ")
      .map((item) => normalizar(item).trim())
      .filter(Boolean);
    const raros = [];
    for (const raro of rarosDeclarados) {
      if (!/^[a-z0-9-]{5,}$/.test(raro) || STOPWORDS.has(raro) || !cands.includes(raro)) {
        throw new Error(b.rel + ": sentinela-fala-raro precisa ser um termo distintivo do carregar-quando/titulo");
      }
      if ((df.get(raro) || 0) !== 1) {
        throw new Error(b.rel + ": sentinela-fala-raro precisa ser exclusivo na biblioteca: " + raro);
      }
      if (!raros.includes(raro)) raros.push(raro);
    }
    for (const t of cands) {
      const n = df.get(t) || 99;
      if (n <= DF_TERMO && !raros.includes(t)) termos.push(t);
    }
    if (!termos.length && !raros.length && !b.c["sentinela-fala"]) return; // nunca casaria
    falas.push({
      id: b.c["id"] || b.rel,
      path: b.rel,
      licao: b.c["licao"] || "",
      digest: extrairDigest(b.corpo),
      regex: b.c["sentinela-fala"] || "",
      termos: termos.sort(),
      raros: raros.sort(),
    });
  });

  return {
    livros: brutos.length,
    indice: { gerado_de: "frontmatters de biblioteca/ (mao: sentinela-*; fala: carregar-quando)", sentinelas, falas },
  };
}

function gravarIndice(raiz) {
  const { livros, indice } = compilar(raiz);
  const saida = path.join(raiz, "sentinelas.json");
  const temp = saida + "." + randomUUID() + ".tmp";
  try {
    fs.writeFileSync(temp, JSON.stringify(indice, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    fs.renameSync(temp, saida);
  } finally {
    fs.rmSync(temp, { force: true });
  }
  return livros;
}

if (require.main === module) {
  const raiz = pastaLocal();
  if (!fs.existsSync(path.join(raiz, "biblioteca"))) {
    console.error("Crie a biblioteca primeiro com node scripts/iniciar.js");
    process.exitCode = 1;
  } else {
    console.log(gravarIndice(raiz) + " livros indexados.");
  }
}
module.exports = { compilar, gravarIndice };
