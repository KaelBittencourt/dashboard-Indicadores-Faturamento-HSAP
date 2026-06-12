# Indicadores Faturamento HSAP 📊

Um **Dashboard Executivo** moderno e interativo, construído sob medida para a gestão e acompanhamento em tempo real da produção, metas e performance de faturamento do **HSAP**.

## 🚀 Funcionalidades

- **Sincronização em Tempo Real:** Conecta-se diretamente a uma base de dados do Google Sheets (publicada como CSV) e a cada 30 segundos atualiza o painel automaticamente sem necessidade de refresh manual.
- **Painel de Metas Protegido:** Central para definir metas globais e por setor, persistidas no navegador. Área administrativa restrita por senha.
- **Medidores Inteligentes:** Exibição gráfica e intuitiva (Gauges) do atingimento de metas de cada setor, com formatação dinâmica de cores (Crítico, Atenção, Próximo, Atingido).
- **Projeções de Fechamento:** O algoritmo analisa o ritmo de produção atual e estima as chances e projeções matemáticas para bater as metas até o fim do mês corrente.
- **Gráficos e Evolução:** Integração com **Recharts** para exibição limpa e responsiva do histórico de produção e faturamento.
- **Exportação Multiformato:** Exporte os relatórios e cruzamentos com um clique para **PDF**, **Excel** (.xlsx) ou **CSV**.
- **Design Adaptativo (Dark/Light):** Sistema estético refinado, com transições suaves e adaptabilidade para modo claro e escuro.

## 🛠️ Tecnologias Utilizadas

Este projeto foi gerado para oferecer o máximo de performance utilizando tecnologias web de ponta:

- **React 18** (UI)
- **Vite** (Build Tool)
- **TypeScript** (Segurança e escalabilidade no código)
- **Tailwind CSS** (Estilização e Design System baseado em OKLCH)
- **TanStack Router & Query** (Roteamento moderno e manipulação inteligente de cache de requisições)
- **Recharts** (Visualização e plotagem de dados)
- **jsPDF & SheetJS** (Motor de exportação de dados analíticos)
- **Lucide React** (Ícones SVG)

## 📦 Como Instalar e Rodar Localmente

Certifique-se de possuir o [Node.js](https://nodejs.org/) instalado em seu computador (versão 18+ recomendada).

1. **Clone ou Extraia o repositório:**
   ```bash
   cd hospital-insights
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```

4. Acesse o painel pelo navegador em [http://localhost:8080](http://localhost:8080) (a porta pode variar caso a 8080 esteja em uso).

## 🔒 Acesso Restrito (Metas)

Para alterar ou excluir parâmetros de **Metas por Setor**, você deve clicar em "Editar Metas" no topo da página. Será solicitado uma senha de administrador. 

- **Senha Padrão:** `19735`

---
*Este dashboard foi desenhado para assegurar previsibilidade e agilidade na tomada de decisão dos faturamentos hospitalares.*
