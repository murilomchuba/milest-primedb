# Migrar o MILEST para um Firebase próprio

O sistema hoje roda em `cronograma-7c295` — um ID sorteado quando o projeto
ainda se chamava "Cronograma". O ID de um projeto Firebase **não pode ser
alterado depois**, e ele aparece em lugares que o cliente vê: o endereço
padrão (`cronograma-7c295.web.app`) e, principalmente, o remetente do convite
de acesso (`noreply@cronograma-7c295.firebaseapp.com`). Por isso a troca vale
a pena agora, antes de vender.

O plano: criar um projeto novo, publicar o mesmo código nele, começar com o
banco vazio e aposentar o antigo. **O código da aplicação não muda** — só a
configuração.

Tempo: cerca de 40 minutos de console, mais a espera do DNS se você já for
ligar o domínio.

---

## Antes de começar — as três escolhas que não se desfazem

Leia estas três antes de clicar em qualquer coisa. Todas as outras decisões
deste guia dão para refazer; estas não.

| escolha | por quê é definitiva | o que usar |
|---|---|---|
| **ID do projeto** | não pode ser renomeado; só apagando o projeto e começando de novo | `milest`, e se estiver ocupado veja abaixo |
| **Região do Firestore** | "uma vez provisionado o banco, a localização não muda" — é a própria documentação | `southamerica-east1` (São Paulo) |
| **Conta Google dona** | é quem paga e quem administra | a mesma `mmc.chuba@gmail.com` |

**Sobre o ID.** Ele é único no mundo inteiro, entre todos os projetos de todos
os clientes do Google — então `milest` pode já estar tomado. Tenha a lista
pronta para não travar na hora: `milest-app`, `milest-br`, `milest-sistema`,
`milest-pro` (`milest` puro já está tomado por outra pessoa). O **nome de exibição** é livre e pode ser sempre `MILEST`;
é o ID que precisa ser único. Se cair num alternativo, prefira um que soe bem
como remetente de e-mail, porque é assim que o cliente vai ver:
`noreply@milest-app.firebaseapp.com` está ótimo; `milest-2` não.

**Sobre a região.** `southamerica-east1` é São Paulo. Além da latência, é o
argumento de venda que vale ter na manga: os dados do cliente ficam no Brasil.
O padrão que o console oferece costuma ser `us-central` — troque na tela.

**Sobre o plano.** O Spark (gratuito) dá conta de tudo que o MILEST usa: 1 GiB
de Firestore, 50 mil leituras por dia, Authentication até 50 mil contas ativas
por mês, e Hosting com domínio próprio e HTTPS inclusos. Não precisa cartão
para começar. Duas ressalvas: desde fevereiro de 2026 o Cloud Storage exige o
plano Blaze — o MILEST não usa Storage, mas o backup mensal por
`gcloud firestore export` grava num bucket, então **aquele backup específico
vai pedir Blaze**. O backup de dentro do próprio sistema (aba Plataforma →
Baixar backup) continua funcionando de graça e é o que importa no dia a dia.

---

## Etapa 1 — Criar o projeto

1. Abra <https://console.firebase.google.com> com a conta `mmc.chuba@gmail.com`.
2. **Criar um projeto** → nome de exibição: `MILEST`.
3. Logo abaixo do nome o console mostra o ID que ele sugeriu, com um lápis ao
   lado. **Clique no lápis** e escreva o ID que você quer. Se aparecer que já
   está em uso, vá para o próximo da sua lista — e digite o próximo ali mesmo.

   > **Não passe da tela sem conferir o ID.** Quando o nome pedido está tomado,
   > o console não avisa: ele aceita e cola um sufixo aleatório, e você só
   > descobre depois com um `milest-15198` permanente. O lápis some assim que o
   > projeto é criado. (Foi o que aconteceu na primeira tentativa — `milest`
   > está tomado por outra pessoa.)
   >
   > IDs de projetos excluídos **não voltam a ficar livres**, então não conte
   > com reaproveitar um que você apagou.
4. Google Analytics: **pode desligar**. O MILEST não usa, e sem Analytics o
   projeto fica mais simples (não cria conta do Analytics nem pede região dela).
   Se ligar, o `measurementId` da configuração passa a fazer sentido; sem ele,
   é um campo inofensivo que fica sobrando.
5. Criar e esperar o provisionamento.

Anote o ID final. Ele vai aparecer umas seis vezes daqui para frente.

---

## Etapa 2 — Firestore

1. Menu lateral → **Criar** → **Firestore Database** → **Criar banco de dados**.
2. **Modo de produção** (começa negando tudo — é o certo; nossas regras entram
   no lugar no deploy).
3. **Localização:** `southamerica-east1 (São Paulo)`. Confira duas vezes; é a
   escolha que não volta atrás.
4. Criar.

O banco nasce vazio e trancado. Fica assim até a Etapa 6.

---

## Etapa 3 — Authentication

Menu lateral → **Criar** → **Authentication** → **Vamos começar**.

### 3.1 Google

**Sign-in method** → **Google** → ativar. Escolha o e-mail de suporte do
projeto (a sua conta serve). Salvar.

### 3.2 E-mail com link — as duas chaves

**Sign-in method** → **E-mail/senha** → ative o provedor **e marque também
"Link do e-mail (login sem senha)"** → Salvar.

São duas chaves na mesma tela e as duas precisam ficar ligadas. Só a de cima
ligada faz o convite falhar com `auth/operation-not-allowed` — é exatamente o
item que ficou pendente no projeto antigo, então é o momento de não repetir.

### 3.3 Modelos de e-mail em português

**Templates** → *Endereço de e-mail de login* → lápis:

- remetente: `MILEST`
- assunto: `Seu acesso ao MILEST`
- corpo: reescreva à vontade, **mantendo o marcador `%LINK%`** — é ele que vira
  o link de entrada.

Também dá para trocar o idioma do modelo para Português (Brasil) no seletor do
topo da tela.

---

## Etapa 4 — Registrar o app Web

Ainda no console: **Configurações do projeto** (engrenagem) → aba **Geral** →
role até **Seus apps** → ícone **`</>`** (Web).

1. Apelido do app: `MILEST Web`.
2. **Não** marque "Configurar também o Firebase Hosting" — o Hosting a gente
   configura pelo CLI, com o `firebase.json` que já existe no repositório.
3. Registrar.

A tela seguinte mostra o bloco `firebaseConfig`. **Copie o objeto inteiro** e
me mande aqui no chat — eu troco nos arquivos certos. Ele se parece com isto:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "milest.firebaseapp.com",
  projectId: "milest",
  storageBucket: "milest.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
};
```

Esses valores **não são segredo** — todo app web do Firebase os entrega ao
navegador de quem abre a página. Quem protege os dados é o `firestore.rules`.
Pode colar aqui sem receio.

---

## Etapa 5 — Trocar no código

Esta etapa é minha. Com a configuração da Etapa 4 em mãos, mexo em quatro
lugares:

| arquivo | o que muda |
|---|---|
| `public/firebase-config.js` | o objeto de configuração inteiro |
| `.firebaserc` | o projeto padrão e o apelido |
| `app.src.html` (linha ~3707) | o comando de deploy que a tela mostra — vou fazer ele ler o `projectId` da configuração, para nunca mais precisar de troca manual |
| `firestore.rules` e `LEIA-ME.md` | os comentários que citam o projeto antigo |

Depois rodo `node build.js` e confiro. Nada da lógica do sistema é tocado.

A constante `DONO` no `app.src.html` e a função `contaDona()` no
`firestore.rules` continuam com `mmc.chuba@gmail.com` — é a mesma conta,
então não muda nada.

---

## Etapa 6 — Publicar

No **Terminal do seu Mac** (não aqui no chat — o deploy precisa do seu login
no Google):

```bash
cd ~/Documents/ProjetosIA/Milest
firebase login          # se ainda não estiver logado
firebase use milest     # troque pelo ID final, se for outro
firebase deploy --only hosting
firebase deploy --only firestore:rules
```

Se o `firebase` não for encontrado, instale antes: `npm install -g firebase-tools`.

**As duas linhas de deploy importam.** Publicar só o hosting deixa o banco com
a regra de produção padrão, que nega tudo — o sistema abre e não lê nada. É o
erro mais comum da migração.

Ao terminar, abra `https://<seu-id>.web.app`. O número da versão aparece
embaixo do botão de entrada: precisa ser `2026-09-09.16`. Se for outro, é
cache — recarregue com `Cmd + Shift + R`.

---

## Etapa 7 — Primeiro acesso e primeira empresa

1. Entre com `mmc.chuba@gmail.com`. O banco está vazio, mas essa conta nasce
   reconhecida como dona da plataforma — é para isso que a constante `DONO`
   existe.
2. Aba **Plataforma** → criar a primeira empresa (pode ser a sua, para testes).
3. Ao criar, cadastre o **primeiro administrador** dela. O convite sai por
   e-mail na hora — e é aqui que você descobre se a Etapa 3.2 ficou certa.
   Mande para um e-mail seu e confira que o link entra.
4. Com a empresa criada, teste um cronograma pequeno de ponta a ponta: uma
   atividade, uma dependência, a curva S e um status report em PDF.

Se algo falhar aqui, é configuração de console — não de código. O mesmo código
já roda no projeto antigo.

---

## Etapa 8 — Domínio `app.milest.com.br`

Pode ficar para depois, mas quando for:

1. Console → **Hosting** → **Adicionar domínio personalizado** →
   `app.milest.com.br`.
2. No DNS de `milest.com.br`, crie os registros que o console mostrar — um
   `TXT` em `app` para provar a posse e depois um `A` em `app`. **Use os valores
   da tela**, não os de um guia antigo; eles mudam.
3. **Authentication → Settings → Domínios autorizados → Adicionar domínio** →
   `app.milest.com.br`.

O passo 3 é o que todo mundo esquece e é o que quebra o login: sem ele o Google
devolve `auth/unauthorized-domain` e o link de e-mail falha com
`auth/unauthorized-continue-uri`. Deixe `<seu-id>.web.app` na lista também,
para o endereço padrão seguir funcionando enquanto o DNS propaga.

A raiz `milest.com.br` (a landing) **não** vem para cá — só o subdomínio `app`.

---

## Etapa 9 — Aposentar o `cronograma-7c295`

Só depois que o novo estiver funcionando de verdade, com o teste da Etapa 7
feito. Não tem pressa nenhuma.

1. Baixe um backup pelo sistema antigo (aba Plataforma → Baixar backup) e
   guarde o arquivo fora do projeto. Custa nada e é a sua rede.
2. Deixe o projeto antigo no ar por algumas semanas, desativado do seu uso mas
   intacto.
3. Quando tiver certeza: console do projeto antigo → **Configurações do
   projeto** → rolar até o fim → **Excluir projeto**. O Google segura por 30
   dias antes de apagar de fato.

Vantagem de nascer limpo: a pendência nº 5 do `RETOMAR-AQUI.md` — as coleções
soltas `projects/` e `resources/` na raiz do Firestore — **desaparece
sozinha**. O banco novo já nasce só com `orgs/` e `users/`. Quando o antigo for
embora, dá para remover o bloco "estrutura antiga" do `firestore.rules` e o
botão "Migrar estrutura antiga" da aba Plataforma.

---

## Checklist

Marque conforme for. A ordem importa até a Etapa 6.

- [ ] Projeto criado com ID definitivo anotado
- [ ] Firestore em `southamerica-east1`
- [ ] Google ativado no Authentication
- [ ] E-mail/senha ativado **e** "link do e-mail" marcado
- [ ] Modelo de e-mail em português, com `%LINK%` preservado
- [ ] App Web registrado e `firebaseConfig` copiado
- [ ] Arquivos do repositório atualizados (comigo)
- [ ] `firebase deploy --only hosting`
- [ ] `firebase deploy --only firestore:rules`
- [ ] Versão `2026-09-09.16` visível na tela de entrada
- [ ] Entrada como dono da plataforma funcionando
- [ ] Primeira empresa criada e convite recebido por e-mail
- [ ] Cronograma de teste completo, com PDF
- [ ] `app.milest.com.br` no Hosting e nos domínios autorizados
- [ ] Backup do projeto antigo guardado
- [ ] `cronograma-7c295` excluído

---

## Se der errado

| sintoma | causa quase certa |
|---|---|
| Tela abre mas não carrega nada, erro de permissão no console do navegador | faltou `firebase deploy --only firestore:rules` |
| `auth/configuration-not-found` no login | o Authentication nunca foi inicializado neste projeto — console → Authentication → **Vamos começar** |
| `auth/operation-not-allowed` ao pedir o link | a segunda chave da Etapa 3.2 não está marcada |
| "Empresa criada, mas o convite não saiu" | mesma causa: falta o *Link do e-mail* em Método de login → E-mail/senha |
| Não acho o ✉ para reenviar o convite | o painel **Plataforma** não gerencia usuários de empresa — é o isolamento funcionando. Veja a nota abaixo |
| `auth/unauthorized-domain` no botão do Google | domínio fora da lista de autorizados (Etapa 8.3) |
| `auth/unauthorized-continue-uri` ao enviar convite | mesma causa acima |
| Versão antiga na tela | cache — `Cmd + Shift + R` |
| `firebase: command not found` | `npm install -g firebase-tools` |

---

## Nota: o convite não se reenvia pelo painel da plataforma

Isso confunde na primeira vez e **não é um defeito** — é a promessa do produto
funcionando. A aba **Plataforma** cadastra o primeiro administrador de uma
empresa e, feito isso, não tem mais caminho até os usuários dela. O ✉ que
reenvia o link vive na aba **Usuários**, e essa aba só aparece para quem é
administrador **de dentro** daquela empresa — o que o gestor da plataforma
não é.

Então, quando um convite se perde, há dois caminhos e nenhum deles passa pelo
painel da plataforma:

1. **A própria pessoa pede o link** na tela de entrada: digita o e-mail dela e
   recebe a mensagem. O convite e o login são a mesma coisa — não existe
   "finalizar cadastro". É o caminho normal e resolve quase sempre.
2. **Outro administrador da mesma empresa** reenvia pelo ✉ da aba Usuários.

Para você percorrer a experiência do cliente de ponta a ponta, crie uma empresa
de teste e cadastre **você mesmo** como administrador dela. A conta dona
(`DONO`, no topo do `app.src.html`) reafirma o papel de plataforma a cada
carregamento, então entrar numa empresa como administrador não te tira do painel.
