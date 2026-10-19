/* Configuração web do Firebase — DOIS DESTINOS, UM ARQUIVO.
   Onde achar os valores: Console do Firebase -> Configurações do projeto
   -> Seus apps -> app da Web -> "Configuração do SDK".

   Estes valores NÃO são segredo: todo app web do Firebase os expõe ao
   navegador. Quem protege os dados são as regras em firestore.rules.

   POR QUE O ARQUIVO ESCOLHE SOZINHO
   O clone de layout precisa de outro banco, e a diferença entre produção e
   clone cabia neste arquivo. Mantê-lo diferente em cada branch seria pedir
   para que um merge mandasse o clone escrever na carteira de verdade — o
   erro que não se percebe no dia em que acontece. Então o arquivo é IGUAL
   nos dois branches e quem decide é a PÁGINA, pelo endereço de onde ela foi
   servida. Não há como publicar a configuração errada.

   A REGRA FALHA PARA O LADO SEGURO
   Só os endereços de produção listados abaixo caem no banco de produção.
   Qualquer outro — clone, canal de pré-visualização, localhost, domínio
   novo que alguém esqueceu de listar aqui — cai no banco do CLONE. O pior
   caso vira "o app não acha os dados", que é barulhento e se conserta numa
   linha; o contrário seria o clone gravando por cima do que é real, que não
   tem volta.                                                               */
(function () {
  var PRODUCAO = {
    apiKey: "AIzaSyAA9Qejlul1zK9nxCXai864hm8FwD_dtcU",
    authDomain: "milest-app.firebaseapp.com",
    projectId: "milest-app",
    storageBucket: "milest-app.firebasestorage.app",
    messagingSenderId: "510689287624",
    appId: "1:510689287624:web:abf259a38805a6162ff4fd",
    measurementId: "G-VGF340FF7V"
  };

  /* O clone de layout. Preencher com os valores do projeto novo assim que
     ele existir no console. Enquanto estiver vazio, qualquer endereço que
     não seja de produção simplesmente não conecta — de propósito. */
  var CLONE = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  };

  var h = String((typeof location !== 'undefined' && location.hostname) || '').toLowerCase();
  /* O prefixo sozinho deixaria qualquer domínio chamado "milest-app-algo"
     entrar como produção. Exigir também o sufixo do Firebase mantém os
     canais de pré-visualização funcionando e fecha o sósia. */
  var doFirebase = /\.web\.app$/.test(h) || /\.firebaseapp\.com$/.test(h);
  var ehProducao = h === 'app.milest.com.br' || (h.indexOf('milest-app') === 0 && doFirebase);
  window.__FIREBASE_CONFIG__ = ehProducao ? PRODUCAO : CLONE;

  /* Um aviso no console de quem abrir o clone: a tela é idêntica, e confundir
     os dois é o jeito mais fácil de achar que um dado sumiu. */
  if (!ehProducao && window.console && console.info)
    console.info('MILEST: este endereço NÃO é produção. Banco: ' + (CLONE.projectId || '(nenhum configurado)'));
})();
