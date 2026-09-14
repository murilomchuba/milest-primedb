# MILEST — publicação e operação

Sistema de gestão de projetos e marcos: cronograma CPM, curva S, status report,
report gerencial, portfólio, apontamento de horas e documentos. Roda no Firebase
Hosting com Firestore e entrada por e-mail e senha.

- **Projeto Firebase:** `milest-app`
- **Versão atual:** `2026-09-14.3`
- **Domínios:** `app.milest.com.br` (sistema) e `milest.com.br` (landing)

---

## 1. Gerar os arquivos

Toda a aplicação vive em **`app.src.html`** — é o único arquivo que se edita.
Depois de qualquer alteração:

```bash
cd ~/Documents/ProjetosIA/Milest
node build.js
```

Isso escreve dois arquivos:

| arquivo | para quê |
|---|---|
| `cronograma.html` | versão solta, abre com duplo clique, dados só no navegador |
| `public/index.html` | versão publicada, com login Google e Firestore |

## 2. Publicar

O projeto Firebase serve **dois sites**:

| alvo | pasta | endereço | o que é |
|---|---|---|---|
| `app` | `public/` | `milest-app.web.app` → `app.milest.com.br` | o sistema |
| `site` | `site/` | `milest-site.web.app` → `milest.com.br` | a landing |

Os dois moram no mesmo projeto, então são um `firebase login` só, um painel só e
nenhuma hospedagem paga. A landing é um HTML de 37 KB e quatro imagens; o plano
gratuito do Firebase dá 10 GB de armazenamento e 360 MB/dia de transferência —
sobra com folga.

### 2.1 Criar o segundo site (uma vez só)

```bash
cd ~/Documents/ProjetosIA/Milest
firebase hosting:sites:create milest-site
```

O nome é único no mundo, como o do projeto. Se `milest-site` estiver ocupado,
escolha outro e **troque no `.firebaserc`**, na linha `"site": ["milest-site"]`.
Os apelidos `app` e `site` já estão configurados ali; não precisa rodar
`firebase target:apply`.

### 2.2 Publicar

```bash
node build.js                              # regera public/index.html
firebase deploy --only hosting:app         # só o sistema
firebase deploy --only hosting:site        # só a landing
firebase deploy --only hosting             # os dois
firebase deploy --only firestore:rules     # as regras, quando mudarem
```

`firebase deploy --only hosting:app` é o comando do dia a dia: a landing muda
pouco, o sistema muda sempre.

O número da versão do sistema aparece **na própria tela de login**, embaixo do
botão. Se o número lá não for o que você acabou de publicar, a página está em
cache: recarregue com `Cmd + Shift + R`.

### 2.3 O formulário da landing

`site/contato.php` precisa de PHP, que o Firebase Hosting não tem — por isso ele
está na lista de `ignore` e nem chega a ser publicado. Quem recebe os pedidos é
o **Web3Forms**: o formulário posta direto do navegador para a API deles, e eles
mandam o e-mail para a caixa verificada. 250 envios por mês, sem custo.

A chave fica no início do `<script>` do `site/index.html`:

```js
const CHAVE_WEB3FORMS = 'cole-a-chave-aqui';
```

**Com a chave vazia**, a página avisa o visitante e abre o programa de e-mail
dele — funciona, mas depende de ele concluir o envio, então perde pedidos.

**Para trocar a caixa que recebe** (quando `contato@milest.com.br` existir), mexa
no painel do Web3Forms, não no código: a chave continua a mesma.

A chave pode ficar visível no HTML. Ela só autoriza gravar naquele formulário e
não dá acesso a nada — é assim que o serviço foi desenhado.

O `contato.php` continua no repositório, intacto, caso a landing um dia vá para
uma hospedagem com PHP. Nesse caso basta apagar a chave: a constante `DESTINO`
volta sozinha para ele.

## 3. Ligar os domínios

São três etapas, nesta ordem. A terceira é a que mais se esquece e é a que
quebra o login.

### 3.0 Registrar o domínio

`milest.com.br` se registra no **Registro.br**, que é o registrador oficial do
`.br`: R$ 40 por ano, em nome próprio. Não vale pegar o "domínio grátis" de
uma hospedagem — ele amarra o domínio ao fornecedor, e o `.com.br` costuma ficar
de fora dessas promoções de qualquer jeito.

Com o domínio na mão, são **dois** endereços apontando para o mesmo projeto
Firebase: `milest.com.br` (e `www`) para a landing, `app.milest.com.br` para o
sistema. Cada um se adiciona no site correspondente.

### 3.1 Registrar o domínio no Hosting

No console do Firebase → **Hosting**. Ali aparecem os dois sites; escolha o
certo antes de adicionar:

- no site **`milest-site`** → adicione `milest.com.br` e `www.milest.com.br`
- no site **`milest-app`** → adicione `app.milest.com.br`

O Firebase vai pedir para provar que o domínio é seu e depois apontar o tráfego.
No painel de DNS de `milest.com.br` (onde o domínio está registrado), crie:

| tipo | nome | valor |
|---|---|---|
| TXT | `@` e `app` | o texto de verificação que o Firebase mostrar para cada um |
| A | `@` | os IPs que o console apresentar (são dois) |
| A | `app` | os mesmos IPs |
| CNAME | `www` | o que o console indicar para `www.milest.com.br` |

Use exatamente os valores que o console apresentar — eles podem mudar.
A propagação leva de alguns minutos a algumas horas; o certificado HTTPS é
emitido sozinho depois que o DNS resolve.

### 3.2 O endereço do sistema na landing

Os botões **Entrar** da landing saem de uma constante só, no início do
`<script>` do `site/index.html`:

```js
const APP = 'https://app.milest.com.br';
```

Ela reescreve os quatro links marcados com `data-app` — o botão do menu, o
"Já é cliente?", a chamada final e o rodapé. O endereço também está no `href`
de cada um, para funcionar sem JavaScript; se um dia o sistema mudar de
endereço, troque nos dois lugares (um localizar-e-substituir resolve).

### 3.3 E-mail no domínio

O Firebase Hosting não faz e-mail. `contato@milest.com.br` aparece em três
lugares da landing e é para onde o formulário escreve, então precisa existir de
verdade antes de a página ir ao ar.

O Zoho Mail mantém um plano gratuito com domínio próprio — 5 contas, 5 GB cada.
A limitação é não ter IMAP/POP: você lê pelo webmail ou pelo aplicativo deles.
Para uma caixa de contato, resolve. Alternativa paga e sem limitação: Google
Workspace.

Seja qual for, a configuração é o mesmo tipo de trabalho: registros `MX` no DNS
de `milest.com.br`, mais um `TXT` de verificação. Os registros de e-mail
convivem sem conflito com os `A` do Hosting — são tipos diferentes.

### 3.4 Autorizar o domínio no login  ← indispensável

Console do Firebase → **Authentication** → **Settings** → **Authorized domains**
→ **Add domain** → `app.milest.com.br`.

Sem isso o botão "Entrar com Google" abre a janela e devolve o erro
`auth/unauthorized-domain`. Vale a pena conferir também que
`milest-app.web.app` continua na lista, para o endereço antigo seguir
funcionando enquanto o DNS propaga.

### 3.5 Ligar o acesso por e-mail corporativo  ← indispensável

O cliente não usa Gmail: ele entra com `nome@empresadele.com.br`. Isso funciona
pelo **link de acesso** — a pessoa digita o e-mail, recebe uma mensagem e o
link *é* o login. Não há senha para criar nem cadastro para terminar.

Console do Firebase → **Authentication** → **Sign-in method** →
**Email/Password** → ative o provedor **e marque também
"Email link (passwordless sign-in)"** → Salvar.

As duas chaves precisam ficar ligadas: a de cima ("Email/Password") habilita o
provedor, a de baixo ("Email link") é a que permite entrar sem senha. Se só a
de cima estiver ligada, a tela devolve `auth/operation-not-allowed` — e o
sistema mostra exatamente essa instrução na mensagem de erro.

**Deixar o e-mail em português.** Authentication → **Templates** →
*Endereço de e-mail de login* → ícone de lápis. Vale ajustar:

- o **nome do remetente** para `MILEST`;
- o **assunto** para algo como `Seu acesso ao MILEST`;
- o corpo, mantendo o marcador `%LINK%` — é ele que vira o link.

O remetente sai como `noreply@milest-app.firebaseapp.com`. Para mandar de
`acesso@milest.com.br`, na mesma tela há **Customize domain** (pede alguns
registros de DNS). Vale a pena antes de vender: e-mail com o domínio do produto
cai muito menos em spam.

**Domínios autorizados valem para os dois caminhos.** O mesmo item 3.4 acima —
o link volta para `app.milest.com.br`, e se esse endereço não estiver na lista o
envio falha com `auth/unauthorized-continue-uri`.

**O link abre em outro navegador?** Acontece quando a pessoa lê o e-mail no
celular e o link abre num navegador diferente daquele em que pediu. A tela
detecta isso e pede o e-mail de novo para confirmar — ninguém fica travado.

---

## 4. Usuários e permissões

Há **dois níveis**: quem opera a plataforma (você) e quem usa dentro de cada
empresa cliente. A seção 7 detalha o isolamento; aqui ficam os papéis.

| papel | o que faz |
|---|---|
| **Plataforma** | cria e suspende empresas, define planos. Não vê cronograma de ninguém. |
| **Administrador** (da empresa) | tudo dentro da própria empresa, mais o cadastro de usuários dela |
| **Gerente** | cria e edita cronogramas, recursos e status reports da empresa |
| **Leitor** | consulta e baixa os relatórios; não altera nada |

Na prática:

1. Você, na aba **Plataforma**, cria a empresa e cadastra o primeiro
   administrador dela — o e-mail corporativo do contato do cliente. **Ele recebe
   o link de acesso na hora**: clicando no link, entra já como administrador da
   empresa dele.
2. Esse administrador entra e, na aba **Usuários**, convida o resto do time da
   empresa dele — cada convite também sai por e-mail, com o mesmo link.
3. Quem não estiver cadastrado em empresa nenhuma não passa da tela de entrada.

O convite e o login são a mesma coisa: não existe "finalizar cadastro". Se um
convite se perder, o ✉ ao lado da pessoa, na aba **Usuários**, reenvia o link.
Quem tem conta Google pode continuar entrando pelo botão do Google; os dois
caminhos chegam ao mesmo cadastro, porque a chave é sempre o e-mail.

### Entrada: e-mail e senha, só isso

Existe **um caminho de entrada**: e-mail e senha.
O botão do Google e o link de acesso por e-mail saíram da tela.

| situação | o que a pessoa faz |
|---|---|
| primeiro acesso | entra com a senha temporária que você passou; o sistema exige que ela troque na hora |
| esqueceu a senha | "Esqueci minha senha" na tela de entrada — o Firebase manda o link de redefinição |
| quer trocar | botão **Senha**, ao lado do e-mail no topo |

**A confirmação de e-mail é obrigatória** e não é burocracia: o `firestore.rules`
exige `email_verified`, então sem o clique de confirmação a pessoa entraria e não
leria nada. Ao criar o acesso, o MILEST dispara essa confirmação sozinho. Se
alguém disser que "entrou e não apareceu nada", é quase sempre isso — a tela diz
exatamente isso e oferece reenviar.

**A porta de emergência.** Perder a senha da conta dona seria perder a
plataforma, então o botão do Google continua existindo, escondido: abra
`https://app.milest.com.br/?google=1`. O cliente nunca vê. Enquanto essa porta
existir, o provedor Google precisa continuar ligado no console. Para fechá-la de
vez, apague a linha marcada no `app.src.html` (busque por `google=1`) e o bloco
`#gateGoogle` do HTML — mas só depois de ter certeza da sua senha.

### Criar acessos

Quem cria um acesso — você, na aba **Plataforma**, ou o administrador de uma
empresa, na aba **Usuários** — pode **digitar a senha inicial** no campo
"Senha inicial (opcional)", ou deixar em branco e o sistema sorteia uma. Nos
dois casos a senha aparece na tela para você entregar à pessoa, uma vez só:
não fica guardada em lugar nenhum, e nem você consegue lê-la de volta depois.
É assim que uma senha deve se comportar.

O cadastro nasce marcado como `senhaProvisoria`. No primeiro acesso o sistema
abre a janela de troca e não deixa passar sem trocar — a senha que você escolheu
não vira a senha permanente de ninguém.

Se o e-mail **já tiver conta** no MILEST, a senha antiga dela continua valendo e
a tela diz isso: sem servidor, ninguém troca a senha de outra pessoa. O caminho é
o ✉ na lista de usuários, que manda a pessoa criar outra.

### Prazo de acesso (avaliação e assinatura)

Cada empresa tem um campo `expiraEm`. Vencido, ela **continua lendo** os próprios
cronogramas e baixando os relatórios, mas **para de escrever**. É de propósito:
quem testou vê o trabalho que fez do outro lado do vidro, e isso vende melhor do
que uma porta fechada.

- **Definir ou estender:** aba **Plataforma** → botão **Prazo** na linha da
  empresa. Vale na hora, sem republicar nada.
- **Ao criar a empresa:** o padrão é 15 dias, e a lista traz 7, 15, 30 e sem prazo.
- **Cortar tudo** (inadimplência, encerramento) continua sendo **Suspender**.

A barreira é do banco, não da tela: `orgNoPrazo()` no `firestore.rules` entra em
`editaOrg()` e `mandaNaOrg()`. Empresa vencida não escreve nem pelo console do
navegador. E ela não estica o próprio prazo — só a plataforma grava esse campo.

### Pronto para a cobrança, ainda sem cobrança

Toda empresa nasce com um bloco `assinatura` — `status`, `ciclo`, `gateway`,
`idExterno`, `desde` — hoje só preenchido com `avaliacao` ou `nenhuma`. Ele
existe para que ligar um gateway de pagamento seja preencher campos, não
reescrever o sistema.

O que falta para cobrar de verdade é um **webhook**: o gateway confirma o
pagamento chamando um endereço seu, e esse endereço precisa escrever no Firestore
com autoridade. Isso mora em Cloud Functions, que **exige o plano Blaze** — no
Spark o Cloud Functions não existe. Quando esse dia chegar, o webhook faz duas
coisas: empurra `expiraEm` para a frente e atualiza `assinatura.status`. O resto
— tela, regras, bloqueio — já está de pé.

### A regra que vale é a do Firestore

A tela apenas evita que a pessoa perca tempo. A barreira real está no
`firestore.rules`. Por isso **as regras precisam ser publicadas** — se você
publicar só o hosting, o sistema continua com as regras antigas.

---

## 5. Backup

São **três** coisas diferentes, e vale não confundi-las.

**O cliente leva os próprios dados.** Aba Calendário → **Baixar backup
completo**: um JSON com os projetos, atividades, versões, equipe e acessos
daquela empresa. É a portabilidade que a LGPD garante a ele, e você não precisa
fazer nada para cumprir.

**Você guarda os dados de todos.** Pasta `backup/` deste repositório: um script
com o Admin SDK que baixa todas as empresas para o seu computador. O Admin SDK
ignora o `firestore.rules` — é a única forma de alcançar dado de cliente, e ela
mora fora do produto de propósito. O `backup/LEIA-ME.md` tem o passo a passo,
inclusive como restringir a chave a somente leitura e o que escrever no
contrato.

```bash
cd backup && npm install && npm run backup
```

**O Google guarda por você.** *Point-in-time recovery* (7 dias, granularidade de
1 minuto) e backups agendados (até 14 semanas) — os recursos que salvam de erro
humano, e que dependem de conta com faturamento. Ligue os dois no dia em que
ligar o Blaze para a cobrança. Detalhe na seção 6 do `backup/LEIA-ME.md`.

Os três se complementam: o script protege contra perder o projeto no Google, o
PITR protege contra alguém apagar algo hoje de manhã, e o backup do cliente
protege a relação com ele.

## 6. Estrutura dos dados

Ver a seção 7 — a estrutura é organizada por empresa.

---

## 7. Isolamento entre empresas (multiempresa)

Cada empresa cliente é a raiz dos próprios dados. O isolamento é **estrutural**,
não um campo que alguém pode esquecer de filtrar numa consulta:

```
orgs/{orgId}                          cadastro da empresa: nome, CNPJ, plano, situação
orgs/{orgId}/members/{e-mail}         quem é da empresa e com que papel
orgs/{orgId}/projects/{id}            os cronogramas — dentro da empresa
orgs/{orgId}/projects/{id}/tasks      atividades
orgs/{orgId}/resources/{id}           equipe, compartilhada só dentro da empresa
users/{e-mail}                        índice: em que empresa a conta está
```

A regra de projeto verifica **uma coisa só**: ser membro ativo daquela empresa.
O papel de plataforma não aparece em nenhuma dessas linhas — não é que o gestor
seja barrado, é que não existe caminho.

### O painel de plataforma

A aba **Plataforma** aparece para quem tem `plataforma: true` no índice. Ali você
cria empresas, define o plano, suspende e reativa, e vê os contadores que cada
empresa grava sobre si mesma (quantos projetos, quantos usuários). **Nenhum
conteúdo de cronograma passa por esse painel.**

Ao criar uma empresa você cadastra o **primeiro administrador** dela. Nesse
instante a marca `semDono` do documento vira `false`, e as regras impedem que
ela volte a `true` — o provisionamento acontece uma vez e a porta não reabre.
Daí em diante quem gerencia os usuários daquela empresa é ela mesma.

### O limite honesto

As regras impedem o acesso pelo aplicativo. Elas **não** impedem o acesso pelo
console do Firebase nem pelo Admin SDK, que ignoram regras por definição — isso
vale para qualquer banco gerenciado. A promessa de não acessar os dados dos
clientes é contratual, e o que a torna fácil de cumprir é: (a) o produto não
oferece caminho, (b) restringir o IAM do projeto ao mínimo, (c) manter os
*audit logs* do Google Cloud ligados. Coloque isso no contrato de tratamento de
dados: a empresa cliente é a **controladora**, você é o **operador**.

### Testar as regras antes de publicar

As regras carregam a promessa inteira, então vale rodá-las contra o emulador:

```bash
cd ~/Documents/ProjetosIA/Milest/regras
npm install
npm test
```

Sobe o emulador do Firestore local, simula cinco contas (plataforma, admin,
gerente, leitor e alguém de fora) e verifica ~35 situações — inclusive que o
gestor da plataforma não lê projeto de cliente e que a janela de
provisionamento não reabre. Nada toca o banco de produção.

### Migrar o que já existe

Os cronogramas criados antes desta mudança ficaram soltos na raiz do banco
(`projects/...`). Na aba **Plataforma** há o botão **Migrar estrutura antiga**:
ele copia tudo para dentro da empresa escolhida e **não apaga o original**.
Depois de conferir o resultado, apague as coleções `projects` e `resources` da
raiz pelo console do Firebase e remova o bloco "estrutura antiga" do
`firestore.rules`.
