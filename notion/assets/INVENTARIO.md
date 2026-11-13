# Inventário de ativos reais — Clube Maker 3D Emersol

Fonte: código do portal (public/brand.css, public/app.js, public/brand-icon.svg) rodando
em instância local com banco temporário (mesmo código de maker3d.emersol.ai; nada na produção foi tocado).
Capturas com Playwright/Chromium, tema "candy" (o das suas imagens), 2x de resolução.

## Marca
- Logo: `brand/brand-icon.svg` (foguete, vetor original), `brand/favicon.svg`
- Lockup real "Clube Maker 3D · EMERSOL" (recorte da interface): `brand/logo-lockup.png`, `brand/logo-lockup@3x.png`
- Slogan do site: "Imagine. Crie. Imprima." / "Da imaginação para o mundo" / "Criatividade que ganha forma."

## Cores (tema candy, valores lidos do CSS em execução)
| Uso | Hex |
|---|---|
| Fundo da página | #fff8f4 |
| Texto/título | #402e46 |
| Vermelho de ação (botões, passo ativo) | #a63c30 |
| Texto secundário | #786578 |
| Borda | #efded7 |
| Cartão selecionado | #fff0e7 |
| Marca: navy | #162846 |
| Marca: turquesa | #13c4d0 |
| Marca: sol | #ffcf54 |
| Marca: chama | #ff6328 |

## Tipografia
- `font-family: Inter, ui-sans-serif, system-ui…` — pesos 760 (títulos), 720 (h2), 600–700 (botões).
- Arquivos Inter (OFL, instalados no ambiente) em `fonts/`. O site não embute a fonte; usa Inter quando instalada.

## Telas reais (`screens/`, página inteira ou área principal)
00-home, 01-comecar (+ -idea/-file/-link selecionado), 02-ideia(+preenchida), 03-detalhes, 04-revisar,
p-{idea,file,link}-{1,2,2b} e p-link-3.

## Recortes reais de elementos (`cutouts/`, usados na animação)
- Título "Vamos criar algo novo?", barra de 4 passos, cartão do passo (s1…s4, s2-idea/file/link, vazio e preenchido)
- Os 3 cartões de escolha, selecionados e não selecionados
- Botões Continuar e Sair
- `meta.json` com tamanhos em px CSS

## Fluxo real
1 Começar (3 opções) → 2 Sua ideia (varia por opção) → 3 Detalhes (tamanho, cor, quantidade) → 4 Revisar → "Enviar para avaliação" (sem cobrança; responsável aprova o orçamento).

| Opção | Para quê | Passo 2 |
|---|---|---|
| Tenho uma ideia | Só imaginou; a equipe ajuda a descobrir como fazer | Nome, descrição, quem cria, foto/desenho (opcional, PNG/JPG, 25 MB) |
| Já tenho um arquivo 3D | Modelo pronto em STL ou 3MF | Nome, descrição, quem cria, arquivo (25 MB) |
| Escolhi uma peça na internet | Peça de MakerWorld, Printables, Thingiverse | Link, "Buscar dados da peça", para quê, quem pede |

Observação: os dados nas telas (Helena Souza Miranda, "Porta-lápis foguete") são de teste local.
