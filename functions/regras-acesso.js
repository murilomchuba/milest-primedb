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
      && p.idxQuem && p.idxQuem.orgId === orgId)
    return { ok: true, como: 'admin' };

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

module.exports = { decidir, decidirExclusao, senhaValida, chave, DONO };
