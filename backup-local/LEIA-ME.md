# Backup diário automático — como ligar

São duas camadas. A de cima roda sozinha no servidor e não depende de nada
seu estar ligado. A de baixo traz a cópia para perto de você.

| camada | onde roda | o que faz | depende de |
|---|---|---|---|
| `backupDiario` | servidor (Cloud Function) | 21h10, lê o banco inteiro e grava no Cloud Storage do projeto | nada |
| `baixar.sh` | seu Mac | 21h40, baixa a cópia do dia para uma pasta do Google Drive | Mac ligado (ou ele roda ao acordar) |

Todo dia saem **dois arquivos**:

- `milest-backup-AAAA-MM-DD.html` — a página inteira com os dados dentro.
  Dois cliques e ela abre, **sem Firebase e sem internet**. É o que salva o dia
  quando o problema não é um projeto e sim o sistema.
- `milest-backup-AAAA-MM-DD.json` — só os dados, para restaurar pelo sistema
  ou pelo `backup/restaurar.mjs`.

No servidor ficam as cópias dos últimos **60 dias**; no Mac, **30**.

---

## Parte 1 — o servidor (faça uma vez)

**1.1. Ligue o Cloud Storage do projeto.** No console do Firebase →
**Criação → Storage → Vamos começar**. Aceite o local sugerido. Sem isso a
função não tem onde gravar. (É o mesmo projeto `milest-app`, já no Blaze.)

**1.2. Publique a função:**

```
cd ~/Documents/ProjetosIA/Milest/functions
npm install
cd ..
firebase deploy --only functions
```

Isso publica também a `acesso`, a `excluirEmpresa` e a `enviarPesquisa`, que
ainda estavam por publicar.

**1.3. Rode uma vez na mão, para não esperar até as 21h:**

```
firebase functions:shell
```
e, no prompt que abrir, digite `backupDiario()` e Enter. Depois `.exit`.

**1.4. Confira que gravou.** No console do Firebase → **Storage** → pasta
`backups/`. Devem estar lá o `.json` e o `.html` de hoje, mais `ultimo.json` e
`ultimo.html`. Baixe o `.html` e dê dois cliques: o sistema abre com a faixa
“🛟 Cópia de segurança” no topo e o seletor de empresas.

A partir daí ela roda sozinha todo dia às 21h10 (horário de Brasília).

---

## Parte 2 — o seu Mac e o Google Drive (faça uma vez)

**2.1. Instale o Google Cloud SDK** (não precisa de Homebrew):

```
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud auth login
gcloud config set project milest-app
```

O `gcloud auth login` abre o navegador: entre com a conta Google dona do
projeto. É a sua conta que autoriza o download — nenhuma senha fica guardada
em arquivo nenhum.

**2.2. Teste o script:**

```
bash ~/Documents/ProjetosIA/Milest/backup-local/baixar.sh
```

Ele escolhe sozinho onde guardar, nesta ordem: uma pasta do **Google Drive**,
se houver; senão **OneDrive**; senão `~/Documents/Backups MILEST`. Como o Drive
sincroniza a pasta, esse único download resolve o Mac e a nuvem pessoal de uma
vez. A última linha da saída diz onde o arquivo ficou.

**2.3. Agende:**

```
cp ~/Documents/ProjetosIA/Milest/backup-local/com.milest.backup.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.milest.backup.plist
```

Pronto. Se o Mac estiver desligado ou dormindo às 21h40, o `launchd` roda assim
que ele acordar — é por isso que não usamos `cron` aqui.

Para conferir depois: `launchctl list | grep milest`
Para desligar: `launchctl unload ~/Library/LaunchAgents/com.milest.backup.plist`

---

## Conferir que está vivo

- **No Mac:** `tail -5 ~/Library/Logs/milest-backup.log` — uma linha `ok` por dia.
- **No servidor:** console do Firebase → **Functions → backupDiario → Registros**.
  Procure a linha `backupDiario` com a contagem de empresas, projetos e atividades.

O sinal de que algo parou é simples: a pasta do Drive sem arquivo de ontem.

## Quando alguma coisa falha

| o que aconteceu | o que fazer |
|---|---|
| `gcloud não encontrado` no registro | refaça o 2.1; a tarefa agendada procura o gcloud em `~/google-cloud-sdk/bin`, `/usr/local/bin` e `/opt/homebrew/bin` |
| `não achei o backup no Storage` | a função ainda não rodou nenhuma vez: faça o 1.3 |
| `não parece um backup do MILEST` | o download veio pela metade; o arquivo de ontem foi preservado de propósito. Rode o script de novo |
| a página do dia não saiu (só o `.json`) | o `app.milest.com.br` estava fora do ar na hora. Os **dados** do dia estão salvos; só a página não foi montada |

## O que isto ainda não cobre

A cópia sai do projeto Firebase e chega ao seu Drive, mas o Drive é da mesma
conta Google. Para uma cópia realmente fora do Google, o caminho mais curto é
mandar o `.json` por e-mail — a `enviarPesquisa` já usa o Resend, então a
chave e o remetente já existem. É meia hora de trabalho no dia em que você
quiser.
