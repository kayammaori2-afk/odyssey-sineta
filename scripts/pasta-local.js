"use strict";
const os = require("node:os");
const path = require("node:path");

function pastaLocal() {
  const escolhida = process.env.ODYSSEY_SINETA_HOME;
  if (escolhida && !path.isAbsolute(escolhida)) {
    throw new Error("ODYSSEY_SINETA_HOME precisa ser um caminho absoluto.");
  }
  return escolhida || path.join(os.homedir(), ".odyssey-sineta");
}

module.exports = { pastaLocal };
