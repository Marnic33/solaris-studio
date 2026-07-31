# Solaris Studio

Simulador 3D de instalação fotovoltaica — telhado paramétrico, arranjo de módulos,
estrutura de fixação, sombreamento real e análise por IA.

**Trinity Solaris Brasil**

---

## Estrutura

```
├─ index.html              markup do painel e da cena
├─ vite.config.js          build + proxy de /api no dev
├─ vercel.json             framework, build e limite das funções
├─ api/                    funções serverless (rodam na Vercel, nunca no navegador)
│  ├─ analyze.js           proxy da API da Anthropic — protege a chave
│  └─ irradiacao.js        NASA POWER com reserva no PVGIS
└─ src/
   ├─ main.js              aplicação: cena, painel, interação
   ├─ estilo.css           design system (grafite / âmbar / ciano)
   └─ nucleo/
      ├─ solar.js          posição solar NOAA + irradiância de céu claro
      └─ dados.js          cliente da irradiação medida
```

O `main.js` ainda é um arquivo grande. Conforme cada função do roteiro entrar, ele vai
sendo fatiado para `src/nucleo/` — a ordem de extração está no roteiro abaixo.

---

## Subir pela primeira vez

**1. GitHub.** Crie um repositório vazio e suba estes arquivos (o editor web do GitHub
aceita arrastar a pasta inteira).

**2. Vercel.** Add New > Project > importe o repositório. Ela detecta Vite sozinha;
não mude nada em build settings.

**3. Chave da IA.** Em Settings > Environment Variables, adicione:

| Nome | Valor |
|---|---|
| `ANTHROPIC_API_KEY` | sua chave da Anthropic |

Marque Production, Preview e Development. Redeploy.

Sem essa variável o simulador funciona inteiro — só a aba IA fica indisponível.
A irradiação medida não precisa de chave nenhuma.

---

## Desenvolvimento

Tudo pelo navegador continua funcionando: edite no GitHub, faça commit, a Vercel
publica sozinha. Se quiser rodar local:

```bash
npm install
npm run dev        # interface em :5173
vercel dev         # funções api/ em :3000 (o vite já encaminha)
```

---

## Como os números são calculados

**Posição solar** — algoritmo NOAA. Conferido: 21/jun ao meio-dia em Mairiporã dá 43,2°
de altura ao norte; no equinócio, 66,5° = 90 − latitude.

**Irradiação** — por padrão, modelo de céu claro (Hottel + massa de ar Kasten-Young)
calibrado pelo HSP que você informar. Com o botão *Buscar irradiação real*, passa a usar
a irradiação horizontal medida da NASA POWER e transpõe para o plano de cada água pelo
modelo. Isso é mais correto: dado medido para o nível absoluto, modelo só para a
geometria.

**Sombreamento** — varredura de 12 dias representativos em passos de meia hora, três
raios por módulo, ponderada pela irradiância do instante. Bloqueia apenas a componente
direta; a difusa segue chegando. É perda **geométrica**: não modela diodos de bypass,
então sombra real custa mais caro que o número mostrado.

**Desempenho** — PR fixo de 0,80. Vira modelo elétrico de verdade na fase 2.

---

## Roteiro

Uma função por vez, cada uma em seu commit.

**Fase 1 — feito**
- [x] Repositório, build e deploy
- [x] Proxy da IA com chave protegida
- [x] Irradiação medida (NASA POWER / PVGIS)

**Fase 2 — modelo elétrico** → `src/nucleo/eletrico.js`
- [ ] Banco de inversores (potência, faixa de MPPT, número de entradas, eficiência)
- [ ] Montagem de strings com validação de tensão a frio e a quente
- [ ] Coeficiente de temperatura e temperatura de célula (modelo NOCT)
- [ ] Perdas separadas: sujeira, cabos, mismatch, IAM, degradação
- [ ] Substituir o PR fixo pelo resultado do modelo

**Fase 3 — economia** → `src/nucleo/economia.js`
- [ ] Tarifa, bandeiras, TUSD/TE
- [ ] Fio B escalonado da Lei 14.300
- [ ] Payback, TIR, VPL e fluxo de caixa em 25 anos

**Fase 4 — entrega comercial**
- [ ] Relatório PDF com a cena renderizada, curva mensal e lista de materiais
- [ ] Salvar projeto por cliente (Supabase)

**Fase 5 — precisão**
- [ ] Perfil de horizonte distante (morro, serra)
- [ ] Sombreamento elétrico com diodos de bypass
- [ ] Série horária de 8760 h

---

## Limites conhecidos

- As quantidades de material são estimativa de anteprojeto. Confira contra o manual do
  fabricante da estrutura antes de comprar.
- Não há verificação de carga de vento. Lastro e fixação precisam de NBR 6123.
- A imagem de satélite é da Esri (Maxar, Earthstar Geographics) e exige atribuição
  visível — já está no canto da cena.
