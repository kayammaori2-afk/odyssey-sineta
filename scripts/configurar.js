"use strict";
const path = require("node:path");

// Imprime um fragmento para o usuário mesclar em sua própria configuração.
function citar(caminho) {
  const normalizado = caminho.split(path.sep).join("/");
  // Os hosts interpretam o comando em shells diferentes. Só emita aspas
  // duplas quando o caminho também for literal dentro delas nos dois hosts.
  if (/["$`%!\r\n\\]/.test(normalizado)) {
    throw new Error("Use um caminho de instalação sem caracteres que o shell expande, ou configure o comando no seu host.");
  }
  return '"' + normalizado + '"';
}

function configuracao() {
  const comando = citar(process.execPath) + " " + citar(path.join(__dirname, "sineta.js"));
  function handler() {
    return { type: "command", command: comando, timeout: 5 };
  }
  return { hooks: {
    PreToolUse: [{ hooks: [handler()] }],
    PreCompact: [{ hooks: [handler()] }]
  } };
}
if (require.main === module) console.log(JSON.stringify(configuracao(), null, 2));
module.exports = { configuracao };
