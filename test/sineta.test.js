"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { iniciar } = require("../scripts/iniciar.js");
const { gravarIndice } = require("../scripts/compilar.js");
const { resumir } = require("../avaliacao/conferir.js");

function bancada(t) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "ensaio-sineta-"));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  iniciar(raiz);
  function emitir(evento, extras = {}) {
    const r = spawnSync(process.execPath, [path.resolve(__dirname, "../scripts/sineta.js")], {
      encoding: "utf8", env: { ...process.env, ODYSSEY_SINETA_HOME: raiz, ODYSSEY_SINETA_OFF: "0", ...extras },
      input: JSON.stringify({ session_id: "sessao", hook_event_name: "PreToolUse", ...evento })
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : "";
  }
  return { raiz, emitir };
}

test("avisa no arquivo certo, silencia repetição e rearma após compactar", t => {
  const { emitir } = bancada(t);
  const edicao = { tool_name: "Edit", tool_input: { file_path: "src/importar-csv.js" } };
  assert.equal(emitir({ tool_name: "Edit", tool_input: { file_path: "src/cores.js" } }), "");
  assert.match(emitir(edicao), /00127/);
  assert.equal(emitir(edicao), "");
  emitir({ hook_event_name: "PreCompact" });
  assert.match(emitir(edicao), /01·mao/);
});

test("um patch do Codex considera apenas os arquivos editados", t => {
  const { emitir } = bancada(t);
  const patch = file => ({ tool_name: "apply_patch", tool_input: { input:
    "*** Begin Patch\n*** Add File: " + file + "\n+// importar-csv.js\n*** End Patch" } });
  assert.equal(emitir(patch("src/comentario.js")), "");
  assert.match(emitir(patch("src/importar-csv.py")), /01·mao/);
});

test("reconhece fala em transcrições Claude e Codex e ignora conteúdo de ferramenta", t => {
  const { raiz, emitir } = bancada(t);
  const texto = "O percentil de latência veio de duas janelas";
  const ler = { tool_name: "Read", tool_input: { file_path: "resumo.txt" } };
  const transcript = path.join(raiz, "conversa.jsonl");
  function mensagem(evento) { fs.appendFileSync(transcript, JSON.stringify(evento) + "\n"); }
  mensagem({ role: "tool", message: { role: "user", content: [{ type: "tool_result", content: texto }] } });
  assert.equal(emitir({ ...ler, transcript_path: transcript }), "");
  mensagem({ message: { role: "user", content: texto } });
  assert.match(emitir({ ...ler, transcript_path: transcript }), /02·fala/);
  fs.writeFileSync(transcript, "");
  mensagem({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: texto }] } });
  assert.match(emitir({ ...ler, session_id: "outra", transcript_path: transcript }), /02·fala/);
});

test("um Selo indexado volta à sessão seguinte e a inicialização preserva edições locais", t => {
  const { raiz, emitir } = bancada(t);
  const livro = path.join(raiz, "biblioteca", "04-legendas.md");
  fs.writeFileSync(livro, '---\nid: "04"\ncarregar-quando: "legenda repete categorias com espaços"\nlicao: "Confira espaços finais nos rótulos."\n---\n\n# Legendas\n');
  assert.equal(gravarIndice(raiz), 4);
  const transcript = path.join(raiz, "sessao.jsonl");
  fs.writeFileSync(transcript, JSON.stringify({ message: { role: "user", content: "A legenda repete categorias" } }) + "\n");
  assert.match(emitir({ tool_name: "Read", transcript_path: transcript }), /04·fala/);
  const exemplo = path.join(raiz, "biblioteca", "01-identificadores-csv.md");
  fs.appendFileSync(exemplo, "\nMinha observação local.\n");
  iniciar(raiz);
  assert.match(fs.readFileSync(exemplo, "utf8"), /Minha observação local/);
  assert.ok(fs.existsSync(livro));
});

test("desligado e entrada incompleta terminam silenciosamente", t => {
  const { emitir } = bancada(t);
  assert.equal(emitir({ tool_name: "Edit", tool_input: { file_path: "importar-csv.js" } }, { ODYSSEY_SINETA_OFF: "1" }), "");
  assert.equal(emitir({ hook_event_name: "EventoDesconhecido" }), "");
  assert.equal(emitir({ tool_name: "Read", session_id: null }), "");
});

test("a tabela pública conserva pares incompletos e a contagem de leituras", () => {
  const pares = require("../avaliacao/pares.json");
  const totais = resumir(pares);
  assert.deepEqual(totais.map(g => [g.pares, g.completos]), [[6,5],[6,6],[6,4],[6,6],[4,2]]);
  assert.ok(totais.every(g => g.mudancas === 0 && g.mudancas_pela_letra === 0));
  const nativos = pares.filter(p => p.lote === "nativo");
  assert.deepEqual(["sem", "com"].map(k => [
    nativos.reduce((n,p) => n + p[k].leituras_indice, 0),
    nativos.reduce((n,p) => n + p[k].leituras_livro, 0)
  ]), [[4,4],[1,3]]);
});
