# Odyssey Sineta

Seu agente vai editar o importador de CSV. Antes da edição, recebe um lembrete: **o crachá `00127` já virou `127` desse jeito.** O aviso abre o caminho para o livro que explica o problema, mostra como conferir o resultado e diz quando a regra deixa de valer.

A **Sineta** lê sinais da ação ou da conversa e entrega um aviso curto. O **Selo** é a skill de fechamento que transforma uma descoberta da tarefa em uma lição para a próxima sessão. Os livros são arquivos Markdown que você pode ler, editar e levar para outra ferramenta.

## Ouça o primeiro toque

Com Git e Node.js 20 ou superior, rode:

```sh
git clone https://github.com/kayammaori2-afk/odyssey-sineta.git
cd odyssey-sineta
node scripts/demo.js
```

A demonstração cria uma biblioteca temporária, simula a edição de `src/importar-csv.js` e mostra o aviso que um agente receberia. Funciona sem chave de API e sem instalar dependências.

## Use no seu agente

1. **Escolha onde a skill vai morar.** Para usá-la em um projeto, clone este repositório em `.agents/skills/odyssey-sineta` para Codex, ou em `.claude/skills/odyssey-sineta` para Claude Code. Quem já fez a demonstração também pode mover o clone para um desses destinos. Rode os próximos comandos dentro da pasta final.
2. **Crie a biblioteca local** com `node scripts/iniciar.js`. Os três exemplos vão para `~/.odyssey-sineta/biblioteca/`. A inicialização preserva os arquivos que você editou. Para separar equipes ou projetos, defina `ODYSSEY_SINETA_HOME` com um caminho absoluto no ambiente da inicialização **e** no processo que abre o agente.
3. **Conecte o aviso** com `node scripts/configurar.js`. O comando imprime o JSON com os caminhos da sua instalação. Acrescente as entradas de `PreToolUse` e `PreCompact` às listas de hooks existentes no seu projeto. O Claude Code usa `.claude/settings.local.json`; o Codex usa `.codex/hooks.json`. Esses caminhos gerados são específicos da sua máquina. Abra uma sessão nova e confira o hook na tela `/hooks` do host. No Codex, revise e confie no hook para ativá-lo. [Hooks do Claude Code](https://code.claude.com/docs/en/hooks) · [Hooks do Codex](https://learn.chatgpt.com/docs/hooks)
4. **Feche uma tarefa com o Selo.** Por exemplo, peça: “Registre a lição desta importação e em que caso seria errado aplicá-la”. O agente pode escrever a lição na sua biblioteca e recompilar o índice. [Como o Selo funciona](SELO.md) · [Skill](SKILL.md)

**O que fica no disco.** O hook roda localmente. No canal de conversa, lê as falas de usuário e assistente disponíveis na transcrição do host. Guarda a posição de leitura, uma janela normalizada de até 9.000 caracteres e o intervalo entre avisos na pasta `estado/` da biblioteca local. A lição e o caminho selecionados entram no contexto normal do seu agente. Os livros pessoais e esse estado ficam fora deste clone na configuração padrão. Para pausar, crie um arquivo vazio chamado `OFF` na raiz local ao lado de `biblioteca/`, ou inicie o agente com `ODYSSEY_SINETA_OFF=1`. Para desligar a integração, remova as duas entradas de hook que acrescentou.

## Três livros para experimentar

| Situação | O que o livro ajuda a decidir |
| --- | --- |
| [Crachás num CSV](biblioteca/01-identificadores-csv.md) | Preservar zeros à esquerda em identificadores e continuar somando a coluna de quantidades. |
| [Percentis de latência](biblioteca/02-percentil-latencia.md) | Calcular o p95 do dia inteiro ou comparar turnos, conforme a pergunta do relatório. |
| [Uma aula perto da meia-noite](biblioteca/03-virada-de-data.md) | Agrupar por dia local na agenda e por UTC quando o relatório pede UTC. |

## O aviso mudou a decisão?

**Neste piloto, houve empate nas escolhas.** Em quatro atendimentos, o aviso mudou quantas vezes o agente abriu o índice. Os ensaios foram feitos em 27/11/2026 no Mestre Imortal, sistema de origem da Sineta. Esta distribuição traz o mecanismo e exemplos novos. Um curador reservou os casos e gabaritos antes das respostas. Cada condição foi executada uma vez por caso e modelo.

| Comparação | Pares | Pares com o formato pedido nos dois lados | Resultado |
| --- | ---: | ---: | --- |
| Aviso de metodologia, Claude Opus 5.5 e GPT-6.2 Sol | 12 | 11 | Sem aviso, cada modelo já acertava 6/6. Os 11 pares válidos empataram. |
| Regra curta ou regra com o histórico de duas tentativas do Claude, nos mesmos modelos | 12 | 10 | Nos 10 pares válidos, acrescentar o histórico preservou a escolha. |
| Hook nativo do Claude Code em quatro atendimentos sobre uma regra local | 4 | 2 | O aviso tocou nas quatro execuções com o hook ativo. Os dois pares válidos empataram. |

A pontuação principal exigia uma única letra, A, B ou C. Cinco dos 28 pares ficaram incompletos por formatação ou texto adicional. Ao ler a letra da primeira linha, **os 28 pares mostraram a mesma decisão correta**. Essa segunda leitura foi definida antes do ensaio nativo e depois da coleta nos outros dois. Os testes de metodologia e de transferência usaram os mesmos seis casos em sessões novas. O primeiro entregou no prompt o aviso emitido pelo hook. O ensaio nativo acionou o hook durante uma leitura real.

**O percurso observado.** Nos quatro atendimentos nativos, Claude abriu o índice **4 vezes sem o aviso e 1 vez com ele**. Abriu o livro **4 vezes sem o aviso e 3 vezes com ele**. Os dois braços indicavam que a biblioteca estava disponível. Esses números medem leituras em bancada. A redução de retrabalho em projetos reais continua em aberto.

Rode `node avaliacao/conferir.js` para recontar a tabela a partir dos [pares publicados](avaliacao/pares.json). É uma reanálise das decisões registradas. Para testar o código desta distribuição localmente, rode `node --test`.

**Pesquisa relacionada.** Xin Yu e colaboradores, do Google e da Penn State, estudaram como o histórico de mudanças ajuda a melhorar o sistema que envolve um modelo. Aqui a pergunta foi se um agente escolhe uma ação diferente ao receber uma lição no momento de agir. [Self-Improvement Memory Enables Continual Recursive Self-Improvement](https://arxiv.org/abs/2611.18856v1). Outros projetos públicos exploram memória e avisos em agentes, entre eles [skillmem](https://github.com/liza-studio/skillmem) e [SIPS](https://github.com/RasputinKaiser/Self-Improvement-Plugin).

## O app por trás da Sineta

A Sineta nasceu enquanto construíamos o **Odyssey**, nosso app de musculação. Na próxima vez que você chegar à academia e se perguntar *“qual carga vai na barra hoje?”*, dê uma olhada. O Odyssey monta seu plano de cinco semanas, sugere a carga de cada sessão e mostra sua evolução. [Conheça o Odyssey](https://odysseymethod.com.br/).

[Licença MIT](LICENSE)
