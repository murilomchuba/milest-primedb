# Roteiro do vídeo de demonstração — MILEST

Para regravar o `site/video/milest-tour.mp4`. Duração alvo: **1min50 a 2min**.
O vídeo atual tem cerca de um minuto e cobre cronograma, curva e status report;
o produto cresceu e o tour precisa mostrar que ele resolve o pacote inteiro —
do kickoff ao e-mail para o cliente.

---

## Antes de gravar

**Projeto de demonstração.** Use um projeto fictício, não um cliente real. O que
está nas imagens do site é "Grupo Meridiano · Modernização da Infraestrutura",
13 atividades em duas fases, com Ana Ribeiro, Bruno Teixeira e Carla Nogueira
na equipe. Reaproveitar os mesmos nomes faz o vídeo e a página contarem a mesma
história.

Deixe pronto, antes de apertar o gravador:

- cronograma com as duas fases, dependências e **linha de base salva**
- avanço preenchido (primeira fase concluída, segunda em andamento)
- algumas horas lançadas, para o quadro de horas não aparecer zerado
- RACI preenchida
- aba Kickoff preenchida
- uma entrada no Diário, com uma tabela
- dois ou três projetos na carteira, para o Portfólio não ter uma linha só

**Técnico.** Grave a 1920×1080, janela do navegador em tela cheia, zoom em 100%,
cursor normal. Nada de abas pessoais à mostra. Sem áudio: a narração abaixo vira
legenda na tela, em caixas curtas — é assim que o vídeo funciona quando toca
sem som, que é como quase todo mundo vai vê-lo.

**Ritmo.** Cada cena abaixo tem um tempo. Pausa de meio segundo antes de cada
clique, para o olho acompanhar. Nada de mexer o mouse sem motivo.

---

## Cena 1 — O problema, em uma tela (0:00 – 0:12)

**Mostre:** a aba **Portfólio**, com três ou quatro projetos.

**Faça:** nada. Deixe parado 3 segundos e passe o mouse devagar pela coluna de
situação.

**Legenda:** *"Toda a carteira numa tela: prazo, avanço, IDP e IDC — calculados,
não digitados."*

> Começar pelo portfólio e não pelo cronograma é de propósito. Quem decide a
> compra é quem olha a carteira; quem usa todo dia é quem olha o cronograma.

---

## Cena 2 — Cronograma que calcula (0:12 – 0:35)

**Mostre:** aba **Cronograma**.

**Faça, nesta ordem:**
1. Arraste a barra de uma atividade dois dias para a frente. Deixe as
   sucessoras se moverem sozinhas. **(3s de pausa aqui — é o momento que vende)**
2. Clique no `%` de uma atividade e escolha 75%.
3. Clique em **Ajustar** para o cronograma caber na tela.

**Legenda 1:** *"Caminho crítico recalculado a cada mudança."*
**Legenda 2:** *"Dependências de verdade: TI, II, TT e IT, com atraso."*

---

## Cena 3 — Kickoff (0:35 – 0:52) · **novo**

**Mostre:** aba **Kickoff**, já preenchida.

**Faça:** role de cima a baixo devagar, pare em *Plano de comunicação*, e clique
em **Baixar PDF**. Mostre a primeira folha do PDF que abre — a capa com a marca.

**Legenda:** *"A apresentação de abertura sai do sistema, com a sua marca — e
antes mesmo de existir cronograma."*

---

## Cena 4 — RACI (0:52 – 1:05) · **novo**

**Mostre:** aba **RACI**.

**Faça:** clique numa célula vazia e marque um **R**. Depois clique em
**Exportar** e mostre a folha gerada.

**Legenda:** *"Quem executa, quem responde, quem é consultado e quem é
informado — da sua equipe e da do cliente."*

---

## Cena 5 — Curva S (1:05 – 1:18)

**Mostre:** aba **Curva S**.

**Faça:** passe o mouse sobre o ponto da data de status, para aparecer o valor.

**Legenda:** *"Avanço físico medido pelo peso das atividades. Previsto, linha de
base e realizado na mesma escala."*

---

## Cena 6 — Status report e o e-mail (1:18 – 1:45)

**Mostre:** aba **Status**.

**Faça, nesta ordem:**
1. Mostre a folha montada, rolando até o fim. **(4s)**
2. Clique em **Enviar por e-mail**.
3. Mostre a janela com os destinatários e o texto já preenchido.
4. **Não envie.** Feche a janela. (Se quiser mostrar o envio, use o botão de
   teste, que manda só para você — e corte antes de aparecer qualquer e-mail
   real de cliente.)

**Legenda 1:** *"O status report se monta sozinho a partir do cronograma."*
**Legenda 2:** *"E vai para o cliente por e-mail, com o PDF em anexo, saindo do
seu domínio."*

---

## Cena 7 — Fecho (1:45 – 1:55)

**Mostre:** volte ao **Portfólio**.

**Legenda:** *"Um lugar só. 15 dias grátis, sem cartão."*
**Último quadro:** a marca MILEST sobre fundo claro, com `milest.com.br`.

---

## O que NÃO entra neste vídeo

- **Apontamento de horas por analista.** Está construído, mas ainda não foi
  publicado nem usado por ninguém de verdade. Entra no tour depois que rodar
  algumas semanas em uso real — e aí vale uma cena própria, porque é o
  argumento mais forte para empresas pequenas e médias.
- **Envio automático do status report em dia e hora marcados.** A tela de
  agendamento existe, o envio automático ainda não. Mostrar a tela sem o
  funcionamento é prometer o que não há.
- **Qualquer dado de cliente real.** Nome, logo, valores, nomes de pessoas.

---

## Depois de gravar

1. Exporte em MP4, H.264, 1920×1080. Mire em **menos de 6 MB** — o arquivo atual
   tem 3,7 MB e é o que mantém a página rápida no celular. Se passar muito
   disso, baixe o bitrate antes de baixar a resolução.
2. Substitua `site/video/milest-tour.mp4`.
3. Gere um novo pôster (o primeiro quadro bom, a 1920×1080, em JPG) e substitua
   `site/video/milest-tour-poster.jpg`. O pôster é o que aparece antes de o
   vídeo tocar, e hoje é ele que a maioria dos visitantes vê.
4. Publique com `firebase deploy --only hosting:site`.
