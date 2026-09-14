# Backup dos dados dos clientes

Este script lê **tudo** — todas as empresas, todos os cronogramas. Ele usa o
Admin SDK, que ignora o `firestore.rules` por definição. É a única forma de
alcançar os dados dos clientes, e ela mora aqui fora, num script que você roda
de propósito, e não dentro do produto. Essa separação é o ponto: o MILEST
continua sem oferecer caminho até os dados de ninguém.

---

## 1. Gerar a chave de leitura

A chave do backup precisa **só de leitura**. Se ela vazar, quem a tiver lê
tudo — mas não apaga nada. Vale os cinco minutos a mais.

1. Console do Firebase → engrenagem → **Configurações do projeto** →
   **Contas de serviço** → **Gerar nova chave privada**. Baixa um `.json`.
2. Essa chave nasce com permissão ampla. Para restringir, vá ao
   [console do Google Cloud → IAM](https://console.cloud.google.com/iam-admin/iam),
   ache a conta de serviço recém-criada, edite os papéis dela e deixe apenas
   **Leitor do Cloud Datastore** (`roles/datastore.viewer`).
3. Salve o arquivo nesta pasta como **`chave.json`**.

Se um dia precisar restaurar, gere uma **segunda** conta de serviço com
**Usuário do Cloud Datastore** (`roles/datastore.user`) e salve como
`chave-escrita.json`. O `restaurar.mjs` procura essa primeiro.

> O `.gitignore` desta pasta já bloqueia `chave*.json`. Confira com
> `git status` antes do primeiro commit: chave em repositório é o acidente
> mais comum e o mais caro.

## 2. Rodar

```bash
cd ~/Documents/ProjetosIA/Milest/backup
npm install          # só na primeira vez
npm run backup
```

Sai uma pasta em `saidas/` com o carimbo de data e hora:

| arquivo | o que tem |
|---|---|
| `empresas/<id>.json` | uma empresa inteira: cadastro, membros, projetos, atividades, versões, equipe |
| `users.json` | o índice de contas (quem está em que empresa) |
| `completo.json` | tudo junto, para restaurar de uma vez |
| `_manifesto.json` | o que foi salvo, quantos documentos e o `sha256` de cada arquivo |

O `sha256` serve para conferir depois que o arquivo não corrompeu:
`shasum -a 256 empresas/unimed.json` deve bater com o manifesto.

## 3. Restaurar

**Sempre veja o ensaio primeiro.** Sem `--confirmar` o script não grava nada,
só lista o que faria:

```bash
node restaurar.mjs saidas/2026-09-09T18-00-00/empresas/unimed.json
node restaurar.mjs saidas/2026-09-09T18-00-00/empresas/unimed.json --confirmar
```

Para restaurar dentro de outra empresa (teste, por exemplo):
`--empresa=teste`.

A restauração **regrava por cima** e não apaga o que existe hoje e não está no
arquivo. Sobrescrever é menos destrutivo do que limpar — é a mesma decisão que
o sistema toma na tela de restauração.

## 4. Onde guardar as cópias

O backup carrega os dados dos seus clientes: ele herda a mesma promessa de
confidencialidade que os dados originais. Isso quer dizer, no mínimo:

- disco com criptografia ligada (no Mac, FileVault);
- uma segunda cópia fora do computador — se o Mac for roubado com o backup
  dentro e não houver outra, o backup não serviu para nada;
- nada de anexar por e-mail nem deixar em pasta compartilhada aberta.

**Retenção.** Defina um prazo e cumpra: guardar para sempre é passivo, não
segurança. Uma política razoável é manter as cópias dos últimos 90 dias e
apagar o resto — e apagar tudo de um cliente em até 30 dias depois que o
contrato dele termina.

## 5. O que colocar no contrato

Na LGPD, a empresa cliente é a **controladora** dos dados e você é o
**operador**. Fazer backup é tratamento legítimo, desde que declarado. Vale
dizer, com estas palavras ou parecidas:

> O MILEST mantém cópias de segurança dos dados do CONTRATANTE, retidas por até
> 90 dias, usadas exclusivamente para recuperação em caso de falha ou perda. O
> acesso a essas cópias é restrito ao responsável técnico e registrado. As
> cópias são eliminadas em até 30 dias após o término do contrato.

E a contrapartida, que é o que o cliente quer ouvir: dentro do sistema, o
administrador da empresa dele tem **Baixar backup completo** na aba Calendário
e leva os próprios dados quando quiser. Isso é portabilidade, e você já cumpre.

## 6. Quando migrar para o plano Blaze

Este script protege contra o pior caso improvável (perder o projeto no Google).
Ele **não** protege bem contra o caso provável: alguém apagar algo às 14h e
você perceber às 17h, com o último backup sendo de ontem.

Para isso existem os recursos gerenciados do Firestore, que dependem de conta
com faturamento:

- **Point-in-time recovery** — volta o banco a qualquer minuto dos últimos
  7 dias. É o que salva de erro humano.
- **Backups agendados** — diários ou semanais, retidos por até 14 semanas,
  operados pelo Google.
- **Exportação para o Cloud Storage** — para guardar mais tempo que isso.

Quando ligar o Blaze para a cobrança, ligue os dois primeiros no mesmo dia.
Continue rodando este script assim mesmo: ele é a cópia que não depende do
Google continuar existindo para você.
