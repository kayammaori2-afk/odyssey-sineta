"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { iniciar } = require("./iniciar.js");

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "odyssey-sineta-demo-"));
try {
  iniciar(raiz);
  const evento = {
    session_id: "exemplo", hook_event_name: "PreToolUse",
    tool_name: "Edit", tool_input: { file_path: "src/importar-csv.js" }
  };
  const saida = execFileSync(process.execPath, [path.join(__dirname, "sineta.js")], {
    input: JSON.stringify(evento), encoding: "utf8",
    env: { ...process.env, ODYSSEY_SINETA_HOME: raiz, ODYSSEY_SINETA_OFF: "0" }
  });
  console.log("O agente vai editar src/importar-csv.js. Antes da edição, recebe:");
  console.log(JSON.parse(saida).hookSpecificOutput.additionalContext.replace(raiz, "<biblioteca da demonstração>"));
} finally {
  fs.rmSync(raiz, { recursive: true, force: true });
}
