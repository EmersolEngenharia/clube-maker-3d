#!/bin/bash
# folha de contato: um quadro por batida, em ordem
OUT=$1; shift
D=$(mktemp -d)
TS=(1.00 4.00 6.00 7.20 8.90 10.60 12.40 15.00 17.00 18.80 21.50 24.20 25.90 27.60 29.50)
LB=("1 GANCHO" "2 TITULO" "3 PASSO 1" "4 OPCAO IDEIA" "5 OPCAO ARQUIVO" "6 OPCAO LINK" "7 CONTINUAR" "8 PASSO 2 IDEIA" "9 PASSO 2 ARQUIVO" "10 PASSO 2 LINK" "11 PASSO 3" "12 PASSO 4" "13 ENVIAR" "14 FLUXO" "15 FECHAMENTO")
for FMT in h v; do
  node video/frames.mjs $FMT $D/${FMT}_%t.png ${TS[@]} || exit 1
  i=0
  for t in ${TS[@]}; do
    n=$(printf "%02d" $i)
    if [ $FMT = h ]; then S="scale=640:-1"; else S="scale=-1:640"; fi
    ffmpeg -loglevel error -y -i $D/${FMT}_$t.png -vf "$S,drawtext=fontfile=/usr/share/fonts/opentype/inter/Inter-Bold.otf:text='${LB[$i]}  ${t}s':x=10:y=10:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=6" $D/c${FMT}_$n.png
    i=$((i+1))
  done
done
ffmpeg -loglevel error -y -framerate 1 -i $D/ch_%02d.png -vf "tile=3x5:padding=8:color=0x222222" -frames:v 1 $OUT/folha_contato_16x9.png
ffmpeg -loglevel error -y -framerate 1 -i $D/cv_%02d.png -vf "tile=5x3:padding=8:color=0x222222" -frames:v 1 $OUT/folha_contato_9x16.png
echo done
