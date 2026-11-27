// casar.js — o módulo compartilhado de match.
// Duas vias, uma função cada:
//   casar()     — canal MÃO:  a ferramenta que o agente vai executar (comando/arquivo).
//   casarFala() — canal FALA: o que o agente DISSE no transcript (a intenção).
// O hook usa os mesmos critérios exercitados pelos testes de integração.
"use strict";

const path = require("path");

// Ferramentas de edição do Claude. No Codex, a edição chega como apply_patch.
const EDICAO = { Edit: true, MultiEdit: true, NotebookEdit: true, Write: true };

function normalizarPath(valor) {
  return String(valor || "").trim().replace(/^"|"$/g, "").replace(/\\/g, "/");
}

function candidatosPath(valor, cwd) {
  const bruto = String(valor || "").trim().replace(/^"|"$/g, "");
  if (!bruto) return [];
  const candidatos = [normalizarPath(bruto)];
  if (!cwd) return candidatos;
  const absoluto = path.win32.isAbsolute(bruto) || path.posix.isAbsolute(normalizarPath(bruto));
  if (absoluto) return candidatos;
  try {
    const resolvido = normalizarPath(path.resolve(String(cwd), bruto));
    if (resolvido && !candidatos.includes(resolvido)) candidatos.push(resolvido);
  } catch (_) {}
  return candidatos;
}

// Extrai somente cabeçalhos de arquivo de um patch. Não casa contra o corpo:
// texto editado pode mencionar um path perigoso sem que aquele arquivo seja alvo.
function extrairPathsPatch(command) {
  const paths = [];
  for (const linha of String(command || "").split(/\r?\n/)) {
    let m = /^\*\*\* (?:Add|Update|Delete) File:\s*(.+?)\s*$/.exec(linha);
    if (!m) m = /^\*\*\* Move to:\s*(.+?)\s*$/.exec(linha);
    if (!m) m = /^(?:---|\+\+\+)\s+(?:[ab]\/)?(.+?)\s*$/.exec(linha);
    if (!m || m[1] === "/dev/null") continue;
    const arquivo = normalizarPath(m[1]);
    if (arquivo && !paths.includes(arquivo)) paths.push(arquivo);
  }
  return paths;
}

function permiteFerramenta(ferramentas, ...nomes) {
  const declaradas = String(ferramentas || "").split("|").map((x) => x.trim());
  return nomes.some((nome) => declaradas.includes(nome));
}

/**
 * casar(sentinela, toolName, toolInput) → boolean          [canal MÃO]
 *   sentinela: {ferramentas, comando, arquivo, ...} (vindo de sentinelas.json)
 */
function casar(sentinela, toolName, toolInput, cwd) {
  try {
    const ferramentas = String(sentinela.ferramentas || "");
    const input = toolInput || {};

    if (toolName === "Bash") {
      if (!sentinela.comando) return false;
      if (!permiteFerramenta(ferramentas, "Bash")) return false;
      const comando = String(input.command || "");
      return new RegExp(sentinela.comando, "i").test(comando);
    }

    if (EDICAO[toolName]) {
      if (!sentinela.arquivo) return false;
      if (!permiteFerramenta(ferramentas, "Edit", "Write")) return false;
      const regex = new RegExp(sentinela.arquivo, "i");
      return candidatosPath(input.file_path, cwd).some((arquivo) => regex.test(arquivo));
    }

    if (toolName === "apply_patch") {
      if (!sentinela.arquivo) return false;
      if (!permiteFerramenta(ferramentas, "Edit", "Write", "apply_patch")) return false;
      const regex = new RegExp(sentinela.arquivo, "i");
      return extrairPathsPatch(input.command)
        .some((arquivo) => candidatosPath(arquivo, cwd).some((candidato) => regex.test(candidato)));
    }

    return false;
  } catch (_) {
    return false; // regex inválida ou surpresa → não casa (fail-open)
  }
}

/**
 * normalizar(texto) → string
 * Minúsculas, sem acento, espaços colapsados. Aplicar em AMBOS os lados do match.
 */
function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * casarFala(fala, janelaNormalizada) → {hit, motivo, termos}    [canal FALA]
 *   fala: {id, regex?, termos:[], raros:[]} (vindo de sentinelas.json .falas)
 *   janelaNormalizada: a fala recente do agente, JÁ passada por normalizar().
 * Regra conservadora (anti-ruído):
 *   - regex explícita do livro casou → hit;
 *   - OU um termo RARO (exclusivo daquele livro) apareceu → hit;
 *   - OU 2+ termos distintos do livro apareceram → hit.
 */
function casarFala(fala, janelaNormalizada) {
  try {
    const j = janelaNormalizada || "";
    if (!j) return { hit: false, motivo: "", termos: [] };

    if (fala.regex) {
      try {
        if (new RegExp(fala.regex, "i").test(j)) {
          return { hit: true, motivo: "regex", termos: [] };
        }
      } catch (_) {} // regex do livro inválida: ignora só a regex
    }

    const contemTermo = (termo) => {
      const escaped = String(termo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp("(?:^|[^a-z0-9])" + escaped + "(?:$|[^a-z0-9])", "i").test(j);
    };

    const raros = Array.isArray(fala.raros) ? fala.raros : [];
    for (const r of raros) {
      if (r && contemTermo(r)) return { hit: true, motivo: "raro", termos: [r] };
    }

    const termos = Array.isArray(fala.termos) ? fala.termos : [];
    const achados = [];
    for (const t of termos) {
      if (t && contemTermo(t)) {
        achados.push(t);
        if (achados.length >= 2) return { hit: true, motivo: "termos", termos: achados };
      }
    }
    return { hit: false, motivo: "", termos: achados };
  } catch (_) {
    return { hit: false, motivo: "", termos: [] };
  }
}

module.exports = { casar, casarFala, normalizar, extrairPathsPatch, normalizarPath, candidatosPath };
