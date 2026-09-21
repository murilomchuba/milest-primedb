# MILEST — auditoria de segurança

> Feita em 18/09/2026, sobre `firestore.rules` (170 linhas), `app.src.html` e
> `regras/teste-regras.mjs`. O objetivo era responder a duas perguntas: **um
> cliente consegue ver os dados de outro?** e **o sistema aguenta ser vendido?**


## Atualização de 21/09/26: achado 3 fechado e modo suporte

**Achado 3 (apagar e recriar empresa): corrigido nas regras.** A plataforma
só apaga pelo navegador uma empresa que nunca teve dono (`semDono == true`).
Um cliente de verdade sai pela função `excluirEmpresa` (servidor), que exige a
empresa suspensa antes e o nome digitado. Ela apaga **tudo** com
`recursiveDelete` e solta o índice de quem apontava para ela, sem deixar nada
órfão para ser lido depois. A exclusão fica registrada na coleção
`auditoria`, que só o Admin SDK e o console enxergam. Os quatro testes que
documentavam o buraco agora exigem que ele esteja fechado.

**Modo suporte.** O administrador da empresa libera, na aba Usuários, o
acesso do suporte por 24 h, 3 dias ou 7 dias, em modo "só ver" ou "ver e
alterar" (`orgs/{org}/suporte/acesso`). As regras (`suporteAtivo` e
`suporteEdita`) só abrem projetos e recursos para a plataforma enquanto o
prazo vale. Vencido, o banco recusa, com a tela aberta ou não. A plataforma
não consegue gravar a liberação: só `mandaNaOrg`. O limite de 7 dias por
liberação também é garantido pela regra. Entradas, saídas e alterações ficam
em `orgs/{org}/suporteLog`, que o cliente lê e ninguém apaga. Ao sair do modo
suporte, o navegador do operador descarta o cache local da carteira.

**Limite que continua valendo:** as regras protegem o aplicativo, não o dono
do projeto Google, que enxerga tudo pelo Console do Firebase. Isso é
compromisso contratual, não técnico. Para registrar também as *leituras*
feitas fora do app, ligue os Data Access audit logs do Firestore (IAM →
Registros de auditoria → Cloud Firestore API → Leitura de dados).

## Resumo

O isolamento entre empresas está **bem construído**, e isso não é elogio de
praxe: a separação é estrutural (cada empresa é a raiz dos próprios dados), a
autorização não depende da tela, e existe uma suíte de 50 testes automatizados
que já cobria os ataques principais. Não encontrei nenhum caminho pelo qual um
cliente leia os dados de outro.

O que precisa de atenção antes de vender não está nas regras — está em volta
delas: **não há backup automático**, **o App Check não está ligado**, e a
promessa de que "nem o operador vê os seus dados" tem um limite que você
precisa conhecer antes de escrevê-la num contrato.

## O que já protege

| mecanismo | onde | por que importa |
|---|---|---|
| Isolamento estrutural | `orgs/{orgId}/projects/...` | não existe consulta que cruze empresas; não é filtro, é caminho |
| Pertencer é ser membro | `daOrg()` exige `orgs/{org}/members/{seu e-mail}` | o índice `users/` é conveniência, não autorização — forjá-lo não abre porta |
| Negação por padrão | `match /{documento=**} { allow read, write: if false }` | o que não foi liberado está fechado |
| E-mail confirmado | `logado()` exige `email_verified == true` | conta criada e não confirmada não existe para o banco |
| Papéis no banco | `editaOrg()` exige papel `admin`/`gerente` | adulterar o JavaScript não dá escrita a um leitor |
| Operador sem caminho | as regras de `projects` não citam a plataforma | no fluxo normal, quem opera o MILEST não lê cronograma de cliente |
| Janela de provisionamento | `semDono` só anda de `true` para `false`; `propria` é imutável | fechada a empresa, o operador não se cadastra nela |
| Senha provisória | `crypto.getRandomValues`, 10 caracteres, ~59 bits | não é adivinhável |
| Prazo vencido | corta escrita, mantém leitura | decisão comercial, não brecha |

Testei também a auto-promoção: um leitor **não** consegue mudar o próprio papel,
reativar o próprio cadastro nem apagar a própria linha de membro. Escrevi esses
casos como teste (não estavam cobertos) — ver o fim deste documento.

---

## Achados

### ALTO — 1. Não existe backup automático

É o achado mais sério, e é de estabilidade, não de invasão. Hoje o único backup
é o que você baixa à mão na aba Plataforma. Se alguém apagar um projeto por
engano, se um bug gravar lixo por cima, ou se uma conta for comprometida e usada
para destruir dados, **não há de onde voltar** além do arquivo que você tenha
lembrado de baixar.

Para um sistema que você vai vender, isso é inaceitável antes do primeiro
cliente pagante. O Firestore oferece duas coisas que resolvem:

- **PITR (point-in-time recovery)**: restaura o banco em qualquer instante dos
  últimos 7 dias. Liga no console, custa pouco.
- **Exportações agendadas** para o Cloud Storage, com retenção maior.

### ALTO — 2. O console do Firebase enxerga tudo

As regras valem para o navegador. **Não valem para o console do Firebase nem
para o Admin SDK.** Quem tiver acesso de proprietário ao projeto `milest-app` lê
todos os dados de todos os clientes, com as regras intactas.

Hoje essa pessoa é você, pela conta `mmc.chuba@gmail.com` — uma conta Gmail
pessoal, que também é o `contaDona()` escrito dentro das regras. Ela é o ponto
único de falha do sistema inteiro.

O que fazer: ativar verificação em duas etapas nessa conta hoje; conferir em
IAM quem mais tem acesso ao projeto e remover o que não for necessário; e, no
médio prazo, mover a titularidade para uma conta corporativa dedicada, separada
do seu e-mail pessoal.

### ALTO — 3. Apagar e recriar a empresa contorna a promessa de não-acesso

No Firestore, **apagar um documento não apaga as subcoleções dele**. As regras
permitem que a plataforma apague e recrie `orgs/{cliente}`. Então existe este
caminho:

1. a plataforma apaga `orgs/unimed` — os projetos continuam no banco;
2. recria `orgs/unimed` com `semDono: true`, reabrindo a janela;
3. cadastra um cúmplice como admin (a regra só proíbe cadastrar **a si mesmo**);
4. o cúmplice entra e lê todos os cronogramas que nunca foram apagados.

Isso não é uma brecha para invasores — é um limite da garantia que você pode
prometer. Deixei os quatro passos escritos como teste, marcados como falha
conhecida, para virarem proteção quando a regra for fechada.

Correção sugerida: só permitir apagar empresa que nunca teve dono.

```
allow delete: if souPlataforma() && resource.data.get('semDono', false) == true;
```

### ALTO — 4. App Check não está ativo

As chaves do Firebase no `firebase-config.js` são públicas por natureza — isso
está certo e documentado no próprio arquivo. O que falta é o **App Check**, que
atesta que a requisição veio do seu site de verdade.

Sem ele, qualquer pessoa pode usar suas chaves de fora do navegador para
martelar o Auth (tentativas de senha, sondagem de e-mails) e consumir sua cota.
As regras continuam valendo — ninguém lê dado alheio por isso —, mas você fica
exposto a abuso de custo e a ataque de força bruta em contas de cliente.

### MÉDIO — 5. As regras não validam o que é gravado

`allow write: if editaOrg(org)` aceita qualquer documento de qualquer tamanho.
Um cliente mal-intencionado, ou um bug do próprio sistema, pode gravar lixo e
inflar a sua conta do Firestore. Não há limite por empresa.

O que fazer: alerta de orçamento no Google Cloud (imediato, cinco minutos), e
validação de tamanho nas regras para os documentos de anexo.

### MÉDIO — 6. Um administrador pode ocupar o índice de um e-mail alheio

O administrador da empresa A pode criar `users/fulano@empresaB.com` apontando
para a empresa A, desde que essa pessoa ainda não tenha entrado no sistema. E o
administrador legítimo da empresa B **não consegue desfazer**, porque a regra de
atualização proíbe mudar o `orgId` existente.

Não vaza dado nenhum — a vítima não passa a ver nada da empresa A, e a empresa A
não vê nada dela. Mas trava a entrada dessa pessoa até você corrigir à mão.

### MÉDIO — 7. Dados antigos ainda na raiz do banco

As coleções `projects/` e `resources/` da estrutura anterior à separação por
empresa continuam lá, legíveis pela conta dona. São dados vivos guardados além
da finalidade — o tipo de coisa que a LGPD trata como retenção indevida e que,
numa auditoria de cliente, é difícil de explicar.

Já está na sua lista de pendências; vale subir a prioridade.

### BAIXO — 8. Proteção contra enumeração de e-mails

Por padrão o Firebase Auth responde de forma diferente para e-mail que existe e
e-mail que não existe, o que permite descobrir quem são seus clientes. Há uma
opção no console para desligar isso.

### BAIXO — 9. Chave de API sem restrição de origem

Vale restringir a chave por referrer HTTP no Google Cloud Console, aceitando
apenas `app.milest.com.br`. É defesa em profundidade, não barreira real.

### BAIXO — 10. Sem verificação em duas etapas para administradores de cliente

O administrador de uma empresa entra só com e-mail e senha. Para um sistema que
guarda cronograma e custo de projeto, oferecer 2FA vira diferencial de venda.

---

## O que fazer, em ordem

**Antes do primeiro cliente pagante**

1. Ligar PITR e exportação agendada do Firestore.
2. Ativar verificação em duas etapas na conta `mmc.chuba@gmail.com`.
3. Conferir quem tem acesso ao projeto em IAM.
4. Criar alerta de orçamento no Google Cloud.
5. Ligar a proteção contra enumeração de e-mails.

**Antes de crescer**

6. Ativar o App Check.
7. Fechar a regra de exclusão de empresa (achado 3).
8. Apagar as coleções antigas da raiz e o bloco correspondente nas regras.
9. Restringir a chave de API por origem.

**Quando fizer sentido**

10. Conta corporativa dedicada como proprietária do projeto.
11. 2FA para administradores de cliente.
12. Validação de tamanho nas regras.

---

## O que você pode prometer ao cliente

Escreva isto, que é verdade e se sustenta numa auditoria:

> Os dados de cada empresa ficam em uma área separada do banco. O acesso depende
> de a pessoa constar como membro ativo daquela empresa, verificado pelo servidor
> a cada leitura e a cada gravação — não pelo aplicativo. Não existe consulta no
> sistema que atravesse empresas.

**Não escreva** que é tecnicamente impossível a equipe do MILEST acessar os
dados. Não é: quem administra o projeto no Firebase tem acesso administrativo ao
banco, como em qualquer SaaS. O que dá para afirmar com honestidade é que a
operação normal não tem esse caminho, e que qualquer tentativa exige uma
intervenção administrativa que fica registrada.

---

## Como rodar os testes

```
cd regras && npm install && npm test
```

São **69 casos** (50 que já existiam + 19 escritos nesta auditoria), rodando
contra o emulador local — nada toca a produção. Os novos cobrem escalada de
privilégio dentro da empresa, e-mail não verificado, a fronteira comercial do
cadastro da empresa, a ocupação de índice e o caminho de apagar-e-recriar.

Quatro casos estão marcados `[FALHA CONHECIDA]`: eles **passam** hoje porque
documentam os buracos dos achados 3 e 6. Quando as regras forem corrigidas,
troque `assertSucceeds` por `assertFails` e eles passam a proteger a correção.

> Nota: o emulador do Firestore precisa baixar um arquivo de
> `storage.googleapis.com` na primeira execução, e as duas redes que eu alcanço
> bloqueiam esse endereço. Por isso a auditoria foi feita na leitura do código, e
> os 19 testes novos ainda **não foram executados** — rode-os no seu terminal.
