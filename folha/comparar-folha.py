#!/usr/bin/env python3
"""Compara duas capturas da folha de status, cenário por cenário.

    python3 comparar-folha.py base depois [limiar_pct]

Mede a fração de pixels diferentes e a maior diferença de canal. Para um
refactor que NÃO devia mudar nada, o limiar é 0. Para uma mudança de geometria
assumida (a normalização na grade), passe um limiar e olhe a imagem de
diferença que ele escreve ao lado.

Sai com código 1 se algum cenário passar do limiar — serve de teste.
"""
import sys, os
from PIL import Image, ImageChops

CENARIOS = ['normal', 'pausado', 'selo', 'muitas-fases', 'magro']

def comparar(a_dir, b_dir, limiar):
    falhou = False
    print('')
    print('  %-14s %10s %10s   %s' % ('cenário', 'px difs', 'maior Δ', ''))
    print('  ' + '-' * 52)
    for c in CENARIOS:
        pa, pb = os.path.join(a_dir, c + '.png'), os.path.join(b_dir, c + '.png')
        if not (os.path.exists(pa) and os.path.exists(pb)):
            print('  %-14s %10s' % (c, 'FALTA'))
            falhou = True
            continue
        A = Image.open(pa).convert('RGB')
        B = Image.open(pb).convert('RGB')
        if A.size != B.size:
            print('  %-14s  tamanho diferente: %s vs %s' % (c, A.size, B.size))
            falhou = True
            continue
        dif = ImageChops.difference(A, B)
        bb = dif.getbbox()
        if bb is None:
            print('  %-14s %10s %10s   idêntico' % (c, '0', '0'))
            continue
        # fração de pixels com qualquer diferença, e a maior diferença de canal
        cinza = dif.convert('L')
        hist = cinza.histogram()
        difs = sum(hist[1:])
        total = A.size[0] * A.size[1]
        pct = 100.0 * difs / total
        maior = max(i for i, n in enumerate(hist) if n)
        marca = 'ok' if pct <= limiar else 'ACIMA DO LIMIAR'
        if pct > limiar:
            falhou = True
            # a imagem de diferença só é escrita quando interessa olhar
            saida = os.path.join(b_dir, c + '.dif.png')
            dif.point(lambda v: min(255, v * 6)).save(saida)
            marca += '  → ' + os.path.basename(saida)
        print('  %-14s %9.3f%% %10d   %s' % (c, pct, maior, marca))
    print('')
    return falhou

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    lim = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
    sys.exit(1 if comparar(sys.argv[1], sys.argv[2], lim) else 0)
