# Linha de base visual da folha de status

A folha de status é o artefato que vai para o cliente. Regressão aqui é
visível e constrangedora, e o `desenharStatusReport()` — 255 linhas de SVG em
coordenadas absolutas — vai ser reescrito para a grade configurável. Esta pasta
existe para que essa reescrita seja verificável em vez de esperançosa.

## Como funciona

`base-folha.mjs` abre o `cronograma.html` construído, monta cinco projetos na
memória, chama `desenharStatusReport()` e guarda o SVG e um PNG de cada um.
`comparar-folha.py` mede a diferença entre duas capturas.

```
node base-folha.mjs base          # antes da mudança
node base-folha.mjs depois        # depois
python3 comparar-folha.py base depois 0
```

O limiar é a fração de pixels que pode diferir. **Zero** para um refactor que
não devia mudar nada. Quando algum cenário passa do limiar, o script escreve
uma imagem de diferença ao lado, com o contraste ampliado.

Sai com código 1 se algum cenário reprovar, então serve de teste.

## Os cinco cenários, e por que estes

Nenhum é decorativo: cada um exercita uma regra especial da cascata de
posicionamento atual, e são exatamente esses os caminhos que um refactor quebra
sem avisar.

| Cenário | O que exercita |
|---|---|
| `normal` | o caso de todo dia, com linha de base, horas e os quatro textos preenchidos |
| `pausado` | a faixa de pausa acrescenta duas linhas ao cabeçalho e empurra o corpo inteiro para baixo |
| `selo` | selo definido à mão: mais duas linhas de justificativa no cabeçalho, em vermelho |
| `muitas-fases` | 14 fases — a negociação entre ENTREGAS e "Em Andamento" aperta o passo e a fonte para tudo caber |
| `magro` | sem linha de base, sem horas e sem textos: os estados vazios de todos os quadros, e a curva sem a linha de base |

Os dois primeiros cenários são a razão de as linhas da grade precisarem ser
**proporcionais** e não em pixels: entre `normal` e `pausado` o corpo da folha
encolhe uns 40 px só por causa do cabeçalho.

## O dia congelado

O rodapé escreve "Gerado em `<hoje>`". A captura substitui `todayISO()` por uma
data fixa antes de desenhar. Sem isso a linha de base capturada hoje acusaria
diferença amanhã — e um teste que falha sozinho com o calendário é pior que
teste nenhum, porque ensina a ignorá-lo.

## Onde isto roda

No container do Claude, não no Mac: precisa de Playwright com o Chromium em
`/opt/pw-browsers/chromium`. Está versionado aqui para a linha de base ficar ao
lado do código que ela descreve, e para uma sessão futura poder continuar sem
recapturar.

## Como usar na reescrita

A fase da grade vale a pena ser partida em duas, e a razão é esta pasta:

**1a — extrair sem mover.** Os dez blocos viram funções `desenhar(ctx, rect)`,
recebendo exatamente os retângulos que a cascata de hoje calcula. A geometria
não muda. **O limiar aqui é zero**: se qualquer pixel mudou, o refactor comeu
alguma coisa.

**1b — trocar a cascata pela grade.** Aí a geometria muda de propósito (a
coluna passa de 444 para 450, o vão central de 20 para 8) e a comparação deixa
de ser automática: é para olhar a imagem de diferença e decidir. Recapturar a
linha de base depois que 1b for aceita.

Partir assim isola o único passo perigoso num passo que a máquina sabe
verificar.
