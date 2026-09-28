#!/bin/bash
# MILEST — traz a cópia do dia do Cloud Storage para este Mac.
#
# Fica numa pasta do Google Drive quando existe uma, e no Mac de qualquer
# jeito: o Drive sincroniza sozinho, então uma rodada resolve os dois
# destinos. Não apaga nada no servidor; só lê.
#
# Instalação e agendamento: veja LEIA-ME.md aqui do lado.

set -uo pipefail

PROJETO="${MILEST_PROJETO:-milest-app}"
DIAS="${MILEST_DIAS:-30}"          # quantas cópias ficam guardadas aqui no Mac
DIA="$(date +%F)"
REGISTRO="$HOME/Library/Logs/milest-backup.log"

log() { echo "$(date '+%F %T')  $*" >> "$REGISTRO"; }
mkdir -p "$(dirname "$REGISTRO")"

# o gcloud não está no PATH de uma tarefa agendada; procuro onde ele costuma ficar
for c in "$HOME/google-cloud-sdk/bin/gcloud" /usr/local/bin/gcloud /opt/homebrew/bin/gcloud "$(command -v gcloud 2>/dev/null)"; do
  [ -x "${c:-}" ] && GCLOUD="$c" && break
done
if [ -z "${GCLOUD:-}" ]; then
  log "ERRO: gcloud não encontrado. Veja o LEIA-ME.md."; exit 1
fi

# O gcloud exige Python 3.10+ e o macOS ainda entrega 3.9. O pacote do gcloud
# traz o seu próprio Python, mas só depois que o install.sh roda — e uma tarefa
# agendada não herda variável de ambiente nenhuma. Então aponto na mão.
if [ -z "${CLOUDSDK_PYTHON:-}" ]; then
  for c in "$HOME/google-cloud-sdk/platform/bundledpython/bin/python3" \
           "$HOME"/google-cloud-sdk/platform/bundledpython*/bin/python3 \
           /usr/local/bin/python3.1[0-9] /opt/homebrew/bin/python3.1[0-9] \
           /Library/Frameworks/Python.framework/Versions/3.1[0-9]/bin/python3; do
    [ -x "${c:-}" ] || continue
    v=$("$c" -c 'import sys;print(sys.version_info[0]*100+sys.version_info[1])' 2>/dev/null || echo 0)
    if [ "${v:-0}" -ge 310 ] 2>/dev/null; then export CLOUDSDK_PYTHON="$c"; break; fi
  done
fi

# onde guardar: Google Drive se houver, senão OneDrive, senão Documentos
DESTINO=""
for d in "$HOME/Library/CloudStorage"/GoogleDrive-*/"My Drive" \
         "$HOME/Library/CloudStorage"/GoogleDrive-*/"Meu Drive" \
         "$HOME/Google Drive" \
         "$HOME/Library/CloudStorage"/OneDrive-*; do
  [ -d "$d" ] && DESTINO="$d/Backups MILEST" && break
done
[ -z "$DESTINO" ] && DESTINO="$HOME/Documents/Backups MILEST"
mkdir -p "$DESTINO" || { log "ERRO: não consegui criar $DESTINO"; exit 1; }

# o balde padrão do projeto mudou de nome ao longo dos anos; aceito os dois
BALDE="${MILEST_BALDE:-}"
if [ -z "$BALDE" ]; then
  for b in "${PROJETO}.firebasestorage.app" "${PROJETO}.appspot.com"; do
    if "$GCLOUD" storage ls "gs://$b/backups/ultimo.json" --project "$PROJETO" >/dev/null 2>&1; then
      BALDE="$b"; break
    fi
  done
fi
if [ -z "$BALDE" ]; then
  log "ERRO: não achei o backup no Storage. A função já rodou pelo menos uma vez?"; exit 1
fi

# Dois arquivos por dia:
#   .html  — a página que abre com dois cliques, sem Firebase e sem internet
#   .json  — só os dados, para restaurar pelo sistema ou por backup/restaurar.mjs
# O download vai primeiro para um .parcial: um arquivo pela metade nunca
# substitui o de ontem, que é o erro que estraga um backup sem ninguém ver.
baixar_um() {
  local ext="$1" marca="$2"
  local alvo="$DESTINO/milest-backup-$DIA.$ext" parcial
  parcial="$alvo.parcial"
  if ! "$GCLOUD" storage cp "gs://$BALDE/backups/ultimo.$ext" "$parcial" --project "$PROJETO" >/dev/null 2>>"$REGISTRO"; then
    log "ERRO: falhou ao baixar ultimo.$ext de gs://$BALDE"; rm -f "$parcial"; return 1
  fi
  if ! grep -q "$marca" "$parcial"; then
    log "ERRO: ultimo.$ext não parece um backup do MILEST; mantive o de ontem"
    rm -f "$parcial"; return 1
  fi
  mv -f "$parcial" "$alvo"
  log "ok  $alvo  ($(ls -lh "$alvo" | awk '{print $5}'), de gs://$BALDE)"
  echo "$alvo"
  return 0
}

FALHAS=0
baixar_um json 'backup-total' || FALHAS=1
baixar_um html '__MILEST_BACKUP' || FALHAS=1

# limpeza: só arquivos com o nome que este script cria, e só os mais antigos
find "$DESTINO" -maxdepth 1 \( -name 'milest-backup-*.json' -o -name 'milest-backup-*.html' \) \
  -type f -mtime +"$DIAS" -delete 2>/dev/null

if [ "$FALHAS" -ne 0 ]; then
  echo "Backup do dia incompleto — veja $REGISTRO"; exit 1
fi
echo "Backup de $DIA guardado em: $DESTINO"
