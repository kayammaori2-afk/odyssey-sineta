"use strict";
const dados = require("./pares.json");

function resumir(pares) {
  const grupos = new Map();
  for (const par of pares) {
    const chave = par.lote + " / " + par.modelo;
    if (!grupos.has(chave)) {
      grupos.set(chave, { grupo: chave, pares: 0, completos: 0, mudancas: 0, mudancas_pela_letra: 0 });
    }
    const r = grupos.get(chave);
    r.pares++;
    if (par.sem.estrita !== null && par.com.estrita !== null) {
      r.completos++;
      if (par.sem.estrita !== par.com.estrita) r.mudancas++;
    }
    if (par.sem.primeira_linha !== par.com.primeira_linha) r.mudancas_pela_letra++;
  }
  return [...grupos.values()];
}

if (require.main === module) {
  console.table(resumir(dados));
  const nativos = dados.filter((p) => p.lote === "nativo");
  console.table(["sem", "com"].map(condicao => ({
    aviso: condicao,
    leituras_do_indice: nativos.reduce((n, p) => n + p[condicao].leituras_indice, 0),
    leituras_do_livro: nativos.reduce((n, p) => n + p[condicao].leituras_livro, 0)
  })));
}
module.exports = { resumir };
