"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { pastaLocal } = require("./pasta-local.js");
const { gravarIndice } = require("./compilar.js");

function iniciar(raiz) {
  const exemplos = path.join(__dirname, "..", "biblioteca");
  const destino = path.join(raiz, "biblioteca");
  fs.mkdirSync(destino, { recursive: true, mode: 0o700 });
  for (const nome of fs.readdirSync(exemplos)) {
    if (!nome.endsWith(".md")) continue;
    try {
      fs.copyFileSync(path.join(exemplos, nome), path.join(destino, nome), fs.constants.COPYFILE_EXCL);
    } catch (erro) {
      if (erro.code !== "EEXIST") throw erro;
    }
  }
  return gravarIndice(raiz);
}

if (require.main === module) {
  const raiz = pastaLocal();
  console.log(iniciar(raiz) + " livros indexados em " + path.join(raiz, "biblioteca"));
}
module.exports = { iniciar };
