<?php
/* Recebe o formulário da landing e envia por e-mail.
   Funciona em hospedagem com PHP (HostGator, cPanel em geral).
   Troque o destinatário abaixo se quiser receber em outro endereço. */
$PARA = 'contato@milest.com.br';

header('Content-Type: text/plain; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit('ERRO metodo'); }

$limpa = function ($v, $max = 2000) {
  $v = trim((string)($v ?? ''));
  $v = str_replace(["\r", "\n"], ' ', $v);          // impede injeção de cabeçalho
  return mb_substr($v, 0, $max);
};

$nome     = $limpa($_POST['nome'] ?? '', 120);
$empresa  = $limpa($_POST['empresa'] ?? '', 120);
$email    = $limpa($_POST['email'] ?? '', 160);
$telefone = $limpa($_POST['telefone'] ?? '', 40);
$mensagem = trim((string)($_POST['mensagem'] ?? ''));
$isca     = trim((string)($_POST['website'] ?? ''));  // campo oculto: robô preenche, gente não

if ($isca !== '') { exit('OK'); }                     // descarta em silêncio
if ($nome === '' || $mensagem === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
  http_response_code(400); exit('ERRO dados');
}

$assunto = '[Site MILEST] ' . ($empresa !== '' ? $empresa : $nome);
$corpo = "Nome: $nome\n"
       . "Empresa: " . ($empresa !== '' ? $empresa : '—') . "\n"
       . "E-mail: $email\n"
       . "Telefone: " . ($telefone !== '' ? $telefone : '—') . "\n"
       . "Recebido em: " . date('d/m/Y H:i') . "\n"
       . "IP: " . ($_SERVER['REMOTE_ADDR'] ?? '—') . "\n\n"
       . mb_substr($mensagem, 0, 5000) . "\n";

$cabecalhos = "From: MILEST <nao-responda@" . ($_SERVER['HTTP_HOST'] ?? 'milest.com.br') . ">\r\n"
            . "Reply-To: $nome <$email>\r\n"
            . "Content-Type: text/plain; charset=utf-8\r\n";

if (@mail($PARA, '=?UTF-8?B?' . base64_encode($assunto) . '?=', $corpo, $cabecalhos)) {
  exit('OK');
}
http_response_code(500);
exit('ERRO envio');
