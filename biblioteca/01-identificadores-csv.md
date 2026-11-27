---
id: "01"
titulo: "Zeros à esquerda em identificadores CSV"
carregar-quando: "importar CSV com identificadores e zeros à esquerda"
licao: "O crachá 00127 precisa continuar 00127 depois da importação. Leia a coluna de identificadores como texto."
sentinela-ferramentas: "Edit|Write|apply_patch"
sentinela-arquivo: "(?:^|/)importar-csv[.](?:js|ts|py)$"
---

# O crachá 00127

Um CSV de inscrições tem dois crachás distintos, `00127` e `127`. Se a importação converte a coluna para número, os dois passam a identificar a mesma pessoa. Declare o tipo da coluna ao abrir o arquivo e confira os dois valores depois de exportar.

**Quando aplicar.** O campo identifica uma pessoa, peça ou registro, e os caracteres são significativos.

**Contraprova.** A coluna de quantidade da mesma planilha precisa somar corretamente. Preserve o tipo numérico dela.

*Exemplo fictício para testar o aviso.*
