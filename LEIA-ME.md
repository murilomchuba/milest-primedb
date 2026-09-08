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

---

## 4. Usuários e permissões

Quem entra no sistema sai da coleção `users` do Firestore, gerenciada pela aba
**Usuários** (visível só para administradores).

| papel | o que faz |
|---|---|
| **Administrador** | tudo, mais o cadastro de usuários |
| **Gerente** | cria e edita cronogramas, recursos e status reports |
| **Leitor** | consulta e baixa os relatórios; não altera nada |

Como funciona na prática:

1. O administrador clica em **＋ Convidar usuário** e informa o e-mail exato da
   conta Google da pessoa, o nome e o papel.
2. A pessoa acessa `app.milest.com.br` e entra pelo botão do Google.
3. Quem não está na lista vê a mensagem de acesso não liberado e não passa da
   tela de entrada.

**Suspender** mantém o cadastro e corta o acesso imediatamente — é o caminho
preferível a remover, porque preserva o histórico de quando a pessoa entrou.

A conta `mmc.chuba@gmail.com` é a **dona do sistema**: é sempre administradora,
mesmo que a coleção `users` fique vazia, e não pode ser rebaixada nem removida
pela tela. É a garantia de nunca ficar trancado para fora. Para transferir a
propriedade, troque o e-mail em dois lugares: a constante `DONO` no topo do
`app.src.html` e a função `dono()` no `firestore.rules`.

### A regra que vale é a do Firestore

A tela apenas evita que a pessoa perca tempo. A barreira real está no
`firestore.rules`, que consulta o documento `users/<e-mail>` a cada operação:
leitura para qualquer cadastrado ativo, escrita só para administrador e gerente,
e a coleção `users` só para administrador. Por isso **as regras precisam ser
publicadas** — se você publicar só o hosting, o sistema continua com as regras
antigas.

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

```
users/{e-mail}                  cadastro de acesso: nome, papel, ativo, último acesso
projects/{id}                   dados do projeto: nome, cliente, resumo, calendário, textos do status
projects/{id}/tasks/{id}        atividades
projects/{id}/versions/{id}     histórico de versões (cabeçalho)
projects/{id}/versionsData/{id} histórico de versões (conteúdo)
resources/{id}                  equipe — cadastro único, compartilhado por todos os projetos
```
