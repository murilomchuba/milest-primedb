# MILEST — ponto de retomada (09/09/2026)

Resumo curto para abrir uma conversa nova sem perder o fio. O detalhe operacional
está no `LEIA-ME.md`; aqui fica só o mapa.

## O que é

Sistema de gestão de projetos e marcos (cronograma CPM, curva S, status report,
report gerencial), vendido como SaaS para outras empresas. Um arquivo HTML só,
publicado no Firebase Hosting, com Firestore e login por e-mail.

- **Projeto Firebase:** `milest-app`
- **Versão atual:** `2026-09-15.1` (o número aparece na tela de entrada)
- **Domínios previstos:** `app.milest.com.br` (sistema) e `milest.com.br` (landing)

## Onde está cada coisa

| caminho | o que é |
|---|---|
| `app.src.html` | **o único arquivo que se edita** — a aplicação inteira |
| `build.js` | gera `cronograma.html` (solto) e `public/index.html` (publicado) |
| `firestore.rules` | as regras que sustentam o isolamento entre empresas |
| `regras/` | testes das regras contra o emulador (`npm install && npm test`) |
| `site/` | a landing page (`index.html`, `img/`, `contato.php`) |
| `backups/` | cópias do código em pontos importantes |
| `backup/` | script que baixa todas as empresas (Admin SDK) e restaura |
| `LEIA-ME.md` | publicação, domínio, papéis, isolamento, backup |

Fluxo de trabalho: editar `app.src.html` → `node build.js` → conferir →
`firebase deploy --only hosting` e, quando as regras mudarem,
`firebase deploy --only firestore:rules` (o projeto vem do `.firebaserc`).

## O que já está pronto

> **14/09 — as duas linhas de código foram unidas.** O sistema que estava sendo
> desenvolvido em paralelo (abas Portfólio, Canvas, Horas, Documentos, KPI,
> replanejamento, anexos, backup embutido) virou a base, e as 13 funções da
> camada comercial — entrada por senha, senha temporária, prazo de avaliação —
> foram transplantadas para dentro dele. Resultado: `2026-09-14.2`.


- Cronograma CPM: dependências TI/II/TT/IT com defasagem, folgas, caminho
  crítico, calendário de dias úteis, linha de base e histórico de versões.
- Curva S de avanço físico e indicadores IDP/IDC.
- Status report em folha 16:9 (com curva S embutida, riscos e atividades
  realizadas na semana) e **report gerencial**: um PDF com todos os projetos.
- Identidade MILEST aplicada em todas as telas e nos PDFs.
- Papéis: administrador, gerente e leitor, com aba **Usuários**.
- **Multiempresa**: cada empresa é a raiz dos próprios dados
  (`orgs/{orgId}/projects/...`). O isolamento é estrutural — o gestor da
  plataforma cria e suspende empresas, mas não tem caminho até os cronogramas
  delas. Aba **Plataforma** para isso.
- Backup e restauração dentro do próprio sistema (arquivo único com projetos,
  atividades, versões, equipe e acessos), com escolha da empresa de destino.
- **Entrada só por e-mail e senha**. Criar um acesso gera uma senha temporária
  para entregar à pessoa, que é obrigada a trocá-la no primeiro login; a
  confirmação de e-mail sai junto. "Esqueci minha senha" usa a redefinição do
  Firebase. O Google ficou como porta de emergência escondida (`?google=1`).
- **Prazo de acesso por empresa** (`expiraEm`): vencido, a empresa lê e exporta
  mas não edita — barreira no `firestore.rules`, não só na tela. Botão **Prazo**
  na aba Plataforma define e estende.
- **Bloco `assinatura`** em cada empresa, pronto para um gateway de pagamento
  preencher. Falta só o webhook (que exige o plano Blaze).

## O que ficou em aberto

1. **Ligar o provedor de link no Firebase** — Authentication → Sign-in method →
   Email/Password → marcar também *Email link (passwordless sign-in)*. Sem isso
   o convite não sai (a tela avisa exatamente isso). Detalhe na seção 3.4 do
   `LEIA-ME.md`.
2. **Hospedagem da landing** — decidida em 13/09: fica no **Firebase Hosting**,
   como segundo site do mesmo projeto (alvos `app` e `site` no `firebase.json`).
   Custo zero, nenhum fornecedor novo. Falta rodar `firebase hosting:sites:create
   milest-site` e publicar. Comparei com a Hostinger: os preços anunciados exigem
   48 meses à vista (Premium = R$ 527) e o `.com.br` não entra no domínio grátis.
3. **Formulário da landing** — o código já está pronto para o **Web3Forms**
   (250 envios/mês, grátis). Falta só criar a chave em web3forms.com e colar em
   `CHAVE_WEB3FORMS`, no `site/index.html`. Enquanto a chave estiver vazia, a
   página cai no programa de e-mail do visitante e perde pedidos.
4. **E-mail `contato@milest.com.br`** — ainda não existe e aparece em três
   lugares da landing. Zoho Mail tem plano gratuito com domínio próprio (5 contas,
   sem IMAP/POP); Google Workspace é a alternativa paga.
5. **Domínio** — feito em 14/09. `milest.com.br` e `www` apontam para o site
   `milest-site`; `app.milest.com.br` é um CNAME para `milest-app.web.app`. Os
   botões "Entrar" da landing já usam `https://app.milest.com.br`. Falta
   autorizar `app.milest.com.br` em Authentication → Settings → Domínios
   autorizados, sem o que o login quebra com `auth/unauthorized-domain`.
6. **Landing page** (`site/index.html`) — reescrita em 09/09 em torno da oferta:
   avaliação de 15 dias como chamada principal, seção "Como começa" com os três
   passos e planos **sem valores**. Falta definir os preços (Padrão e Corporativo
   estão "sob consulta") e personalizar o texto da seção "Sobre", que ainda é o
   rascunho genérico.
7. **Estrutura antiga** — as coleções `projects/` e `resources/` soltas na raiz do
   Firestore continuam lá como rede de segurança. Depois de conferir os dados
   migrados, apague-as e remova o bloco correspondente do `firestore.rules`.

## Backup

Três camadas, descritas na seção 5 do `LEIA-ME.md`: o cliente baixa os próprios
dados pela aba Calendário; você baixa todas as empresas com `cd backup && npm run
backup`; e o Google guarda com PITR e backups agendados assim que o Blaze entrar.
A chave de serviço do script deve ser **somente leitura** e nunca vai para o git.

## Antes de mexer em qualquer coisa

Dentro do sistema, aba **Plataforma** (ou Calendário, na versão de empresa) →
**Baixar backup**. Esse arquivo tem os *dados*; este pacote tem o *código*. São
duas coisas diferentes e as duas valem a pena.
