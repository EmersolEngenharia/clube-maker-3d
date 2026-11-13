#!/bin/bash
cd /home/user/clube-maker-3d/notion
for F in h v; do
  for k in 0 1 2 3; do node video/render.mjs $F /tmp/claude-0/-home-user-clube-maker-3d/07536f4c-d0e5-5cdd-aaae-0f5eeec34cc2/scratchpad/f$F $((k*511)) $(( (k+1)*511>2040 ? 2040 : (k+1)*511 )) & done; wait
done
echo ALLDONE
