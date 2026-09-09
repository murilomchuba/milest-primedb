# MILEST — publicação e operação

Sistema de gestão de projetos e marcos: cronograma CPM, curva S, status report
e report gerencial. Roda no Firebase Hosting com login Google e Firestore.

- **Projeto Firebase:** `cronograma-7c295`
- **Domínio previsto:** `app.milest.com.br` (a landing page fica em `milest.com.br`)

---

## 1. Gerar os arquivos

Toda a aplicação vive em **`app.src.html`** — é o único arquivo que se edita.
Depois de qualquer alteração:

```bash
cd ~/Documents/ProjetosIA/Cronograma
node build.js
```

Isso escreve dois arquivos:

| arquivo | para quê |
|---|---|
| `cronograma.html` | versão solta, abre com duplo clique, dados só no navegador |
| `public/index.html` | versão publicada, com login Google e Firestore |

## 2. Publicar

Um comando de cada vez:

```bash
firebase deploy --only hosting --project cronograma-7c295
firebase deploy --only firestore:rules --project cronograma-7c295
```

O número da versão aparece **na própria tela de login**, embaixo do botão.
Se o número lá não for o que você acabou de publicar, a página está em cache:
recarregue com `Cmd + Shift + R`.

---

## 3. Ligar o domínio app.milest.com.br

São três etapas, nesta ordem. A terceira é a que mais se esquece e é a que
quebra o login.

### 3.1 Registrar o domínio no Hosting

No console do Firebase → **Hosting** → **Adicionar domínio personalizado** →
digite `app.milest.com.br`.

O Firebase vai pedir para provar que o domínio é seu e depois apontar o tráfego.
No painel de DNS de `milest.com.br` (onde o domínio está registrado), crie:

| tipo | nome | valor |
|---|---|---|
| TXT | `app` | o texto de verificação que o Firebase mostrar |
| A | `app` | `199.36.158.100` (o Firebase confirma os IPs na tela) |

Use exatamente os valores que o console apresentar — eles podem mudar.
A propagação leva de alguns minutos a algumas horas; o certificado HTTPS é
emitido sozinho depois que o DNS resolve.

### 3.2 Manter a landing page separada

`milest.com.br` (a landing) e `app.milest.com.br` (o sistema) são hospedagens
independentes. Não aponte a raiz do domínio para este projeto: só o subdomínio
`app` vem para cá.

### 3.3 Autorizar o domínio no login  ← indispensável

Console do Firebase → **Authentication** → **Settings** → **Authorized domains**
→ **Add domain** → `app.milest.com.br`.

Sem isso o botão "Entrar com Google" abre a janela e devolve o erro
`auth/unauthorized-domain`. Vale a pena conferir também que
`cronograma-7c295.web.app` continua na lista, para o endereço antigo seguir
funcionando enquanto o DNS propaga.

### 3.4 Ligar o acesso por e-mail corporativo  ← indispensável

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

O remetente sai como `noreply@cronograma-7c295.firebaseapp.com`. Para mandar de
`acesso@milest.com.br`, na mesma tela há **Customize domain** (pede alguns
registros de DNS). Vale a pena antes de vender: e-mail com o domínio do produto
cai muito menos em spam.

**Domínios autorizados valem para os dois caminhos.** O mesmo item 3.3 acima —
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

**Suspender** mantém o cadastro e corta o acesso imediatamente — preferível a
remover, porque preserva o registro do último acesso. Suspender a *empresa*,
pelo painel da plataforma, derruba todos os usuários dela de uma vez (é o
caminho para inadimplência).

A conta `mmc.chuba@gmail.com` é a **dona da plataforma**: nasce cadastrada
mesmo com o banco vazio, para você nunca ficar trancado para fora. Para
transferir, troque o e-mail em dois lugares: a constante `DONO` no topo do
`app.src.html` e a função `contaDona()` no `firestore.rules`.

### A regra que vale é a do Firestore

A tela apenas evita que a pessoa perca tempo. A barreira real está no
`firestore.rules`. Por isso **as regras precisam ser publicadas** — se você
publicar só o hosting, o sistema continua com as regras antigas.

---

## 5. Backup

O Firestore deste plano não faz backup automático. Uma vez por mês vale exportar:

```bash
gcloud firestore export gs://cronograma-7c295.appspot.com/backup-$(date +%Y-%m-%d) \
  --project cronograma-7c295
```

Dentro do sistema, cada cronograma também guarda o próprio histórico de versões
(botão **⟲ Versões**), com o registro do que mudou de uma para a outra.

---

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
cd ~/Documents/ProjetosIA/Cronograma/regras
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
