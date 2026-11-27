# Selo

O Selo é o momento em que o agente que trabalhou na tarefa decide o que vale deixar para outra sessão. A unidade é um problema recorrente. Uma transcrição inteira quase nunca é a melhor forma de encontrá-lo de novo.

1. Procure o problema na sua biblioteca local. Reabra o livro existente ou comece um arquivo Markdown com o formato abaixo.
2. Registre a decisão, a situação em que ela vale e um caso parecido em que levaria a uma escolha errada. Se previu o efeito antes de testá-lo, preserve a previsão original. Se a previsão não foi registrada, diga isso. Anote o que observou e o que ainda falta observar.
3. Acrescente novas tentativas nesse mesmo livro. Empates e pioras também contam. Para uma hipótese em aberto, indique a próxima ocasião em que faria sentido conferi-la.
4. Rode `node scripts/compilar.js` a partir da instalação da skill. A próxima sessão já poderá encontrar a lição pelo assunto. Guarde apenas o mínimo necessário para reproduzir a decisão.

Use uma pasta local da pessoa ou equipe que viveu o caso. A autorização para manter essa memória é separada da decisão de publicar um livro.

## Exemplo de uma nova entrada

```markdown
---
id: "04"
titulo: "Rótulos duplicados na legenda"
carregar-quando: "legenda de gráfico repete categorias com espaços no fim do rótulo"
licao: "Confira espaços nas extremidades antes de agrupar categorias da legenda."
---

# Uma categoria apareceu duas vezes

Situação: o importador recebeu “Norte” e “Norte ”. Neste arquivo o espaço final era ruído.
Previsão antes do teste: aparar os espaços reuniria as duas linhas em uma série.
Observado: o gráfico passou de duas séries para uma; a soma foi preservada.
Contraprova: espaços no meio de nomes compostos fazem parte do nome.
```
