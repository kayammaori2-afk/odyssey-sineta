---
id: "02"
titulo: "Percentil de latência em janelas de tamanhos diferentes"
carregar-quando: "combinar percentil de latência entre janelas com volumes diferentes"
licao: "Para obter o p95 de todas as requisições, reúna as amostras ou combine histogramas compatíveis antes de calcular o percentil."
---

# O p95 de segunda-feira

De manhã chegaram 900 pedidos e à noite chegaram 10. A média dos dois p95 dá o mesmo peso aos dois períodos. Para saber quanto esperaram os 5% mais lentos do dia inteiro, calcule o percentil sobre as requisições reunidas.

**Quando aplicar.** O relatório pede um único p95 de todas as requisições.

**Contraprova.** Se a pergunta é qual turno teve o pior p95, compare os dois percentis por turno. O agregado diário esconderia a resposta.

*Exemplo fictício para testar o aviso.*
