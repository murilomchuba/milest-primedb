/* Quem pode criar ou refazer a senha de quem.
   Função pura: recebe o que já foi lido do banco e decide. Fica separada do
   index.js para dar para testar sem Firebase (npm test).

   Espelha o firestore.rules:
   - o ADMINISTRADOR de uma empresa cria e refaz o acesso das pessoas da
     própria empresa (mandaNaOrg);
   - a PLATAFORMA só mexe no administrador que ela mesma está provisionando.
     Refazer a senha de quem já usa o sistema daria à plataforma um jeito de
     entrar como o cliente e ler os cronogramas dele — e a promessa do MILEST
     é justamente que isso não existe. Então a plataforma só refaz a senha
     enquanto o cadastro ainda está provisório (a pessoa nunca trocou a senha). */

const DONO = 'mmc.chuba@gmail.com';
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const chave = e => String(e || '').trim().toLowerCase();

/* ---- assentos -------------------------------------------------------------
   TODA pessoa com acesso ocupa um assento — administrador, gerente, gerente de
   projetos, leitor e analista. É a régua de cobrança escolhida: um preço por
   pessoa, sem distinção de papel, que é o mais simples de vender e de explicar.

   Mudar a régua é mudar ESTA lista, e só ela: tirar 'analista' e 'leitor' daqui
   faz o sistema inteiro voltar a cobrar só por quem trabalha o plano, inclusive
   as frases que a tela mostra, que são montadas a partir da lista em vez de
   escritas à mão. `app.src.html` tem a mesma lista, pelo mesmo motivo, e as
   duas têm de continuar iguais — a daqui é a que vale, porque é a do servidor. */
const PAPEIS_ASSENTO = ['admin', 'gerente', 'gp', 'leitor', 'analista'];
const TODOS_OS_PAPEIS = ['admin', 'gerente', 'gp', 'leitor', 'analista'];
const ROTULO_PAPEL = {
  admin: 'administrador', gerente: 'gerente da carteira',
  gp: 'gerente de projetos', leitor: 'leitor', analista: 'analista'
};

/** Junta nomes com vírgulas e um "e" no fim, como se escreve de verdade. */
function enumerar(itens) {
  const l = itens.slice();
  if (l.length <= 1) return l[0] || '';
  return l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1];
}

/** A explicação de quem ocupa assento, montada a partir da lista. Assim a
 *  frase nunca desmente o código: mudar a régua muda o texto junto. */
function fraseDosAssentos() {
  const pagos = TODOS_OS_PAPEIS.filter(p => PAPEIS_ASSENTO.includes(p));
  const livres = TODOS_OS_PAPEIS.filter(p => !PAPEIS_ASSENTO.includes(p));
  if (!livres.length) return 'Cada pessoa com acesso ocupa um assento.';
  return 'Ocupam assento: ' + enumerar(pagos.map(p => ROTULO_PAPEL[p])) + '. '
    + 'Não ocupam: ' + enumerar(livres.map(p => ROTULO_PAPEL[p])) + '.';
}

/** Quantos membros ocupam assento. Recebe a lista já lida do banco. */
function contarAssentos(membros) {
  return (Array.isArray(membros) ? membros : [])
    .filter(m => m && m.ativo !== false && PAPEIS_ASSENTO.includes(m.papel)).length;
}

/* A trava de assentos, em forma de função pura: devolve o motivo da recusa, ou
   null quando pode passar.

   Vale na CRIAÇÃO de acesso, não na redefinição: quem já usa o sistema tem de
   poder recuperar a senha mesmo que a empresa esteja acima do limite — o
   limite pode ter sido baixado depois que as pessoas já estavam dentro, e
   trancar a recuperação de senha por causa disso puniria o usuário por uma
   decisão comercial. `limiteAssentos` ausente ou 0 significa sem limite, igual
   ao `expiraEm`.

   A contagem vem do servidor, NUNCA do campo `usuarios` da empresa: esse campo
   é escrito pelo navegador do próprio cliente e serve para o painel mostrar
   quantos são, não para cobrar.

   Falha fechada de propósito: se o limite existe e a contagem não veio, o
   pedido é recusado em vez de passar. Um controle de cobrança que fica
   permissivo quando alguém esquece de passar um parâmetro não é controle. */
function semAssento(p) {
  const limite = Number((p.org && p.org.limiteAssentos) || 0);
  if (!limite || p.modo !== 'criar') return null;
  if (!PAPEIS_ASSENTO.includes(p.membroAlvo && p.membroAlvo.papel)) return null;
  if (typeof p.assentos !== 'number' || !isFinite(p.assentos))
    return 'não consegui conferir os assentos desta empresa; tente de novo.';
  /* O cadastro do alvo já existe quando esta função roda — a tela grava a
     linha do membro e só depois pede o acesso —, então `assentos` já conta
     esta pessoa. Por isso a comparação é `>` e não `>=`. */
  if (p.assentos > limite) {
    const livres = TODOS_OS_PAPEIS.filter(x => !PAPEIS_ASSENTO.includes(x));
    return 'o plano desta empresa tem ' + limite + ' assento(s), e ' + (limite > 1 ? 'eles já estão ocupados' : 'ele já está ocupado') + '. '
      + (livres.length
         ? 'Cadastre esta pessoa como ' + enumerar(livres.map(x => ROTULO_PAPEL[x])) + ', que não ' + (livres.length > 1 ? 'ocupam' : 'ocupa') + ' assento, ou peça mais assentos a quem contratou o MILEST.'
         : 'Para cadastrar mais pessoas, peça mais assentos a quem contratou o MILEST.');
  }
  return null;
}

/**
 * @param {object} p
 *   quem      e-mail de quem chama (já confirmado pelo token)
 *   alvo      e-mail da conta que vai ser criada/refeita
 *   modo      'criar' | 'redefinir'
 *   agora     Date.now()
 *   idxQuem   users/{quem}   (ou null)
 *   idxAlvo   users/{alvo}   (ou null)
 *   org       orgs/{idxAlvo.orgId} (ou null)
 *   membroQuem  orgs/{org}/members/{quem} (ou null)
 *   membroAlvo  orgs/{org}/members/{alvo} (ou null)
 *   assentos    quantos membros da empresa ocupam assento HOJE, contados no
 *               servidor (já incluindo o alvo). Obrigatório quando a empresa
 *               tem `limiteAssentos`; sem ele o pedido é recusado.
 * @returns {{ok:true, como:'admin'|'plataforma'} | {ok:false, motivo:string}}
 */
function decidir(p) {
  const quem = chave(p.quem), alvo = chave(p.alvo);
  if (!EMAIL_OK.test(alvo)) return { ok: false, motivo: 'e-mail inválido.' };
  if (p.modo !== 'criar' && p.modo !== 'redefinir') return { ok: false, motivo: 'pedido inválido.' };
  if (alvo === quem) return { ok: false, motivo: 'para a sua própria senha, use o botão de trocar senha.' };
  if (alvo === DONO || (p.idxAlvo && p.idxAlvo.plataforma === true))
    return { ok: false, motivo: 'contas da plataforma não são gerenciadas por aqui.' };

  const orgId = p.idxAlvo && p.idxAlvo.orgId;
  if (!orgId || !p.org || !p.membroAlvo)
    return { ok: false, motivo: 'esta pessoa ainda não está cadastrada em nenhuma empresa.' };

  // administrador da mesma empresa, ativo, com a empresa ativa e no prazo
  const m = p.membroQuem;
  const orgViva = p.org.ativo !== false;
  const noPrazo = !p.org.expiraEm || p.agora < p.org.expiraEm;
  if (m && m.ativo !== false && m.papel === 'admin' && orgViva && noPrazo
      && p.idxQuem && p.idxQuem.orgId === orgId) {
    /* A trava de assentos vale aqui, no caminho do cliente. A plataforma, mais
       abaixo, não passa por ela: é ela que define o limite, e trancá-la no
       próprio limite impediria até o primeiro administrador de nascer. */
    const falta = semAssento(p);
    return falta ? { ok: false, motivo: falta } : { ok: true, como: 'admin' };
  }

  // plataforma: só o administrador que está sendo provisionado
  const souPlataforma = quem === DONO || (p.idxQuem && p.idxQuem.plataforma === true);
  if (souPlataforma) {
    if (p.membroAlvo.papel !== 'admin')
      return { ok: false, motivo: 'a plataforma só cria o acesso do administrador da empresa.' };
    const provisorio = p.membroAlvo.senhaProvisoria === true || !p.membroAlvo.ultimoAcesso;
    if (p.modo === 'redefinir' && !provisorio)
      return { ok: false, motivo: 'este administrador já definiu a própria senha; só ele (ou outro administrador da empresa) pode refazê-la.' };
    return { ok: true, como: 'plataforma' };
  }
  return { ok: false, motivo: 'só um administrador desta empresa pode fazer isso.' };
}

function senhaValida(s) {
  return typeof s === 'string' && s.length >= 6 && s.length <= 128;
}

/**
 * Pode a plataforma apagar esta empresa inteira (cadastro, projetos, membros)?
 *   quem, idxQuem  — quem chama e o índice dele
 *   org            — orgs/{id} (ou null se não existe)
 *   nomeDigitado   — confirmação: o nome da empresa, digitado
 * Regras: só a plataforma; nunca a empresa própria do operador; a empresa
 * precisa estar SUSPENSA antes (dois passos, para não apagar por engano).
 */
function decidirExclusao(p) {
  const quem = chave(p.quem);
  const souPlataforma = quem === DONO || (p.idxQuem && p.idxQuem.plataforma === true);
  if (!souPlataforma) return { ok: false, motivo: 'só a plataforma exclui empresas.' };
  if (!p.org) return { ok: false, motivo: 'empresa não encontrada.' };
  if (p.org.propria === true) return { ok: false, motivo: 'a empresa do próprio operador não é excluída por aqui.' };
  if (p.org.ativo !== false && p.org.semDono !== true)
    return { ok: false, motivo: 'suspenda a empresa antes de excluir.' };
  const alvo = String(p.org.nome || '').trim().toLowerCase();
  if (!alvo || String(p.nomeDigitado || '').trim().toLowerCase() !== alvo)
    return { ok: false, motivo: 'o nome digitado não confere com o da empresa.' };
  return { ok: true };
}

/**
 * Pode mandar o servidor gerar o backup agora?
 * Só quem opera a plataforma. O backup carrega TODAS as empresas num arquivo
 * só — é a única operação do sistema em que os dados de clientes diferentes se
 * encontram, então ela não desce para administrador de empresa.
 */
function decidirBackup(p) {
  const quem = chave(p.quem);
  const souPlataforma = quem === DONO || (p.idxQuem && p.idxQuem.plataforma === true);
  if (!souPlataforma) return { ok: false, motivo: 'o backup completo é de quem opera a plataforma.' };
  return { ok: true };
}

/**
 * Pode enviar pesquisa de satisfação deste projeto?
 * Administrador ou gerente ativo da empresa, empresa ativa e no prazo.
 */
function decidirPesquisa(p) {
  const orgId = p.idxQuem && p.idxQuem.orgId;
  if (!orgId) return { ok: false, motivo: 'sua conta não está em nenhuma empresa.' };
  const m = p.membroQuem, org = p.org;
  if (!m || m.ativo === false || !['admin', 'gerente'].includes(m.papel))
    return { ok: false, motivo: 'só administradores e gerentes enviam pesquisa.' };
  if (!org || org.ativo === false) return { ok: false, motivo: 'empresa suspensa.' };
  if (org.expiraEm && p.agora >= org.expiraEm) return { ok: false, motivo: 'o prazo de acesso da empresa venceu.' };
  if (!p.projeto) return { ok: false, motivo: 'projeto não encontrado.' };
  const dest = Array.isArray(p.destinatarios) ? p.destinatarios : [];
  if (!dest.length) return { ok: false, motivo: 'informe ao menos um destinatário.' };
  if (dest.length > 50) return { ok: false, motivo: 'no máximo 50 destinatários por envio.' };
  if (dest.some(d => !EMAIL_OK.test(chave(d && d.email)))) return { ok: false, motivo: 'há e-mail inválido na lista.' };
  const perg = Array.isArray(p.perguntas) ? p.perguntas : [];
  if (!perg.length || perg.length > 20) return { ok: false, motivo: 'a pesquisa precisa ter de 1 a 20 perguntas.' };
  if (perg.some(q => !q || !['nps', 'escala', 'texto'].includes(q.tipo) || !String(q.texto || '').trim() || String(q.texto).length > 300))
    return { ok: false, motivo: 'há pergunta inválida.' };
  return { ok: true, orgId };
}

/**
 * Pode mandar o status report deste projeto ao cliente?
 * Mesma régua da pesquisa — administrador ou gerente ativo, empresa ativa e
 * no prazo — mais os limites do que vai pelo fio.
 *
 * O modo teste não é conferido aqui porque ele não é uma permissão e sim uma
 * garantia: em teste o servidor IGNORA a lista e manda só para quem pediu.
 * Decidir isso no servidor é o que impede o acidente clássico de um teste
 * chegar ao cliente.
 */
function decidirStatus(p) {
  const orgId = p.idxQuem && p.idxQuem.orgId;
  if (!orgId) return { ok: false, motivo: 'sua conta não está em nenhuma empresa.' };
  const m = p.membroQuem, org = p.org;
  if (!m || m.ativo === false || !['admin', 'gerente', 'gp'].includes(m.papel))
    return { ok: false, motivo: 'só administradores e gerentes enviam o status report.' };
  if (!org || org.ativo === false) return { ok: false, motivo: 'empresa suspensa.' };
  if (org.expiraEm && p.agora >= org.expiraEm) return { ok: false, motivo: 'o prazo de acesso da empresa venceu.' };
  if (!p.projeto) return { ok: false, motivo: 'projeto não encontrado.' };
  /* O gerente de projetos manda o status DOS PROJETOS DELE. A conferência é
     aqui, no servidor, e não na tela: sem ela o papel que não enxerga o
     projeto do colega poderia mandar um e-mail sobre ele mesmo assim — e o
     corpo da mensagem vem do navegador, então bastaria montá-lo à mão. */
  if (m.papel === 'gp') {
    const eu = chave(p.quem || (p.idxQuem && p.idxQuem.email) || '');
    const titular = chave(p.projeto.gp || '');
    const subs = (Array.isArray(p.projeto.gpExtra) ? p.projeto.gpExtra : []).map(chave);
    if (!eu || (eu !== titular && !subs.includes(eu)))
      return { ok: false, motivo: 'este projeto não é seu.' };
  }
  const dest = Array.isArray(p.destinatarios) ? p.destinatarios : [];
  if (!p.teste) {
    if (!dest.length) return { ok: false, motivo: 'informe ao menos um destinatário.' };
    if (dest.length > 50) return { ok: false, motivo: 'no máximo 50 destinatários por envio.' };
    if (dest.some(d => !EMAIL_OK.test(chave(d && d.email)))) return { ok: false, motivo: 'há e-mail inválido na lista.' };
  }
  const copia = Array.isArray(p.copia) ? p.copia : [];
  if (copia.length > 20) return { ok: false, motivo: 'no máximo 20 endereços em cópia.' };
  if (copia.some(d => !EMAIL_OK.test(chave(d && d.email)))) return { ok: false, motivo: 'há e-mail inválido na cópia.' };
  if (!String(p.corpo || '').trim()) return { ok: false, motivo: 'o corpo do e-mail veio vazio.' };
  if (String(p.corpo).length > 200000) return { ok: false, motivo: 'o corpo do e-mail passou de 200 KB.' };
  /* base64 engorda um terço; 11 MB de texto é um PDF de ~8 MB, e acima disso
     o próprio callable recusaria a chamada com um erro que não explica nada */
  if (p.pdf && String(p.pdf).length > 11000000) return { ok: false, motivo: 'o PDF ficou grande demais para ir por e-mail.' };
  return { ok: true, orgId };
}

/**
 * Pode enviar uma solicitação de mudança de escopo para o de acordo do cliente?
 * Mesma régua da pesquisa e do status — administrador ou gerente ativo, empresa
 * ativa e no prazo —, mais os limites do que vai no documento.
 *
 * O gerente de projetos entra aqui, e de propósito: quem negocia escopo com o
 * cliente é quem toca o projeto. Mas só o projeto DELE, conferido no servidor
 * como no `decidirStatus` — sem isso o papel que não enxerga o projeto do
 * colega poderia pedir aceite sobre ele.
 */
function decidirMudanca(p) {
  const orgId = p.idxQuem && p.idxQuem.orgId;
  if (!orgId) return { ok: false, motivo: 'sua conta não está em nenhuma empresa.' };
  const m = p.membroQuem, org = p.org;
  if (!m || m.ativo === false || !['admin', 'gerente', 'gp'].includes(m.papel))
    return { ok: false, motivo: 'só administradores e gerentes pedem aceite de mudança.' };
  if (!org || org.ativo === false) return { ok: false, motivo: 'empresa suspensa.' };
  if (org.expiraEm && p.agora >= org.expiraEm) return { ok: false, motivo: 'o prazo de acesso da empresa venceu.' };
  if (!p.projeto) return { ok: false, motivo: 'projeto não encontrado.' };
  if (m.papel === 'gp') {
    const eu = chave(p.quem || (p.idxQuem && p.idxQuem.email) || '');
    const titular = chave(p.projeto.gp || '');
    const subs = (Array.isArray(p.projeto.gpExtra) ? p.projeto.gpExtra : []).map(chave);
    if (!eu || (eu !== titular && !subs.includes(eu)))
      return { ok: false, motivo: 'este projeto não é seu.' };
  }
  /* Um aceite não pode sair pedindo concordância com um documento vazio: o
     cliente estaria assinando o nada, e o registro não valeria. */
  const d = p.mudanca || {};
  if (!String(d.titulo || '').trim()) return { ok: false, motivo: 'a mudança precisa de um título.' };
  if (String(d.titulo).length > 160) return { ok: false, motivo: 'o título passou de 160 caracteres.' };
  if (!String(d.descricao || '').trim()) return { ok: false, motivo: 'descreva o que muda.' };
  if (!String(d.justificativa || '').trim()) return { ok: false, motivo: 'explique por que a mudança é necessária.' };
  for (const [k, rot] of [['descricao', 'o que muda'], ['justificativa', 'o porquê'],
                          ['escopo', 'as entregas afetadas'], ['riscos', 'os riscos'], ['seNaoAprovar', 'o cenário de não aprovar']])
    if (String(d[k] || '').length > 4000) return { ok: false, motivo: rot + ' passou de 4000 caracteres.' };
  const n = v => v == null || v === '' ? 0 : Number(v);
  for (const [k, rot] of [['dias', 'os dias'], ['horas', 'as horas'], ['valor', 'o valor']]) {
    const x = n(d[k]);
    if (!isFinite(x)) return { ok: false, motivo: rot + ' precisa ser um número.' };
    if (x < 0) return { ok: false, motivo: rot + ' não pode ser negativo.' };
  }
  const dest = Array.isArray(p.destinatarios) ? p.destinatarios : [];
  if (!dest.length) return { ok: false, motivo: 'informe ao menos um destinatário.' };
  if (dest.length > 10) return { ok: false, motivo: 'no máximo 10 destinatários por envio.' };
  if (dest.some(x => !EMAIL_OK.test(chave(x && x.email)))) return { ok: false, motivo: 'há e-mail inválido na lista.' };
  /* A validade é o que impede um aceite de ser dado meses depois, sobre uma
     estimativa que já não vale. Sem prazo não há proposta, há promessa. */
  const dias = Math.round(Number(d.valePorDias) || 0);
  if (!(dias >= 1 && dias <= 90)) return { ok: false, motivo: 'a validade da proposta precisa ficar entre 1 e 90 dias.' };
  return { ok: true, orgId };
}

module.exports = { decidir, decidirExclusao, decidirBackup, decidirPesquisa, decidirStatus, decidirMudanca,
  senhaValida, chave, DONO, PAPEIS_ASSENTO, TODOS_OS_PAPEIS, contarAssentos, semAssento, fraseDosAssentos };
