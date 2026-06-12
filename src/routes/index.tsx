import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { fetchSheetData, type RawRecord, type MetaRecord } from "@/lib/sheet-data";
import { supabase } from "@/lib/supabase";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import {
  Activity,
  RefreshCw,
  Download,
  Plus,
  TrendingUp,
  TrendingDown,
  Target,
  Calendar,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  Pencil,
  X,
  Trash2,
  Save,
  Sun,
  Moon,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Indicadores Faturamento HSAP" },
      {
        name: "description",
        content:
          "Gestão de produção, metas e performance hospitalar em tempo real com indicadores executivos, rankings e projeções.",
      },
      { property: "og:title", content: "Indicadores Faturamento HSAP" },
      {
        property: "og:description",
        content: "Indicadores, metas e performance hospitalar em tempo real.",
      },
    ],
  }),
  component: DashboardPage,
});

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];
const MONTHS_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const FORM_URL = "https://forms.gle/xB7zJ1E8RNiePEU49";
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1MhI23FR_C_Uf2Km2EuaRd1WyQfEMyRUSS6VUlwZd5ms/edit";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

 function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n: number) {
  return `${n.toFixed(1).replace(".", ",")}%`;
}

function statusForPct(p: number): "crit" | "warn" | "near" | "ok" {
  if (p >= 100) return "ok";
  if (p >= 90) return "near";
  if (p >= 70) return "warn";
  return "crit";
}
function statusColor(s: ReturnType<typeof statusForPct>) {
  switch (s) {
    case "ok": return "var(--success)";
    case "near": return "var(--chart-1)";
    case "warn": return "var(--warning)";
    case "crit": return "var(--destructive)";
  }
}
function statusLabel(s: ReturnType<typeof statusForPct>) {
  return s === "ok" ? "Acima da Meta" : s === "near" ? "Próximo da Meta" : s === "warn" ? "Atenção" : "Crítico";
}
function statusDot(s: ReturnType<typeof statusForPct>) {
  return s === "ok" ? "🟢" : s === "near" ? "🟢" : s === "warn" ? "🟡" : "🔴";
}

// Metas are now managed via Supabase

function DashboardPage() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("dash-theme");
    return (saved as "light" | "dark") || "light";
  });

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("dash-theme", theme);
  }, [theme]);

  const query = useQuery({
    queryKey: ["sheet-data"],
    queryFn: fetchSheetData,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  const data = query.data;
  const records = data?.records ?? [];

  // Metas managed via Supabase
  const [metas, setMetas] = useState<MetaRecord[]>([]);
  const [metasModalOpen, setMetasModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  useEffect(() => {
    supabase.from("metas").select("setor, meta").then(({ data, error }) => {
      if (error) {
        console.error("Erro ao buscar metas:", error);
        alert("Erro ao buscar metas: " + error.message);
      }
      else if (data) setMetas(data as MetaRecord[]);
    });
  }, []);

  const updateMetas = useCallback(async (newMetas: MetaRecord[]) => {
    setMetas(newMetas);
    const { error } = await supabase.from("metas").upsert(
      newMetas.map(m => ({ setor: m.setor, meta: m.meta })),
      { onConflict: "setor" }
    );
    if (error) {
      console.error("Erro ao atualizar metas:", error);
      alert("Erro ao salvar no banco: " + error.message);
    }
  }, []);

  // Filter state
  const [selMonths, setSelMonths] = useState<number[]>([]);
  const [selYears, setSelYears] = useState<number[]>([]);
  const [selSetores, setSelSetores] = useState<string[]>([]);
  const [selProcs, setSelProcs] = useState<string[]>([]);

  // Persist filters
  useEffect(() => {
    const raw = localStorage.getItem("dash-filters");
    if (raw) {
      try {
        const f = JSON.parse(raw);
        setSelMonths(f.selMonths ?? []);
        setSelYears(f.selYears ?? []);
        setSelSetores(f.selSetores ?? []);
        setSelProcs(f.selProcs ?? []);
      } catch { /* ignore */ }
    }
  }, []);
  useEffect(() => {
    localStorage.setItem(
      "dash-filters",
      JSON.stringify({ selMonths, selYears, selSetores, selProcs }),
    );
  }, [selMonths, selYears, selSetores, selProcs]);

  // Universe of options (dynamic from sheet)
  const allYears = useMemo(
    () => Array.from(new Set(records.map((r) => r.date?.getFullYear()).filter(Boolean) as number[])).sort(),
    [records],
  );
  const allSetores = useMemo(
    () => Array.from(new Set(records.map((r) => r.setor))).sort(),
    [records],
  );
  const allProcs = useMemo(
    () => Array.from(new Set(records.map((r) => r.procedimento))).sort(),
    [records],
  );

  const filtered = useMemo<RawRecord[]>(() => {
    return records.filter((r) => {
      if (!r.date) return false;
      if (selMonths.length && !selMonths.includes(r.date.getMonth())) return false;
      if (selYears.length && !selYears.includes(r.date.getFullYear())) return false;
      if (selSetores.length && !selSetores.includes(r.setor)) return false;
      if (selProcs.length && !selProcs.includes(r.procedimento)) return false;
      return true;
    });
  }, [records, selMonths, selYears, selSetores, selProcs]);

  const metaBySetor = useMemo(() => {
    const m = new Map<string, number>();
    metas.forEach((x) => m.set(x.setor, x.meta));
    return m;
  }, [metas]);

  // KPI calcs
  const totalProducao = filtered.reduce((s, r) => s + r.quantidade, 0);
  const totalRegistros = filtered.length;
  const ticketMedio = totalRegistros ? totalProducao / totalRegistros : 0;

  // Meta global: sum of metas for setores currently in scope
  const setoresInScope = selSetores.length
    ? selSetores
    : Array.from(new Set([...allSetores, ...metas.map((m) => m.setor)]));
  const metaGlobal = setoresInScope.reduce((s, st) => s + (metaBySetor.get(st) ?? 0), 0);
  const pctMeta = metaGlobal ? (totalProducao / metaGlobal) * 100 : 0;
  const faltante = Math.max(0, metaGlobal - totalProducao);

  // Period boundaries for projection
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const diasNoMes = monthEnd.getDate();
  const hoje = Math.min(now.getDate(), diasNoMes);
  const diasRestantes = Math.max(0, diasNoMes - hoje);

  const producaoMesAtual = records
    .filter((r) => r.date && r.date >= monthStart && r.date <= monthEnd)
    .reduce((s, r) => s + r.quantidade, 0);
  const mediaDiaria = hoje > 0 ? producaoMesAtual / hoje : 0;
  const projecaoMes = mediaDiaria * diasNoMes;
  const necessarioPorDia = diasRestantes > 0 ? (metaGlobal - producaoMesAtual) / diasRestantes : 0;
  const probMeta =
    projecaoMes >= metaGlobal ? "Alta" : projecaoMes >= metaGlobal * 0.85 ? "Média" : "Baixa";

  // Period-over-period (compare scope vs previous equivalent window)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const prodMesAnterior = records
    .filter((r) => r.date && r.date >= prevMonthStart && r.date <= prevMonthEnd)
    .reduce((s, r) => s + r.quantidade, 0);
  const variacao =
    prodMesAnterior > 0 ? ((producaoMesAtual - prodMesAnterior) / prodMesAnterior) * 100 : 0;

  // Evolução por mês (key YYYY-MM)
  const evolMap = new Map<string, number>();
  filtered.forEach((r) => {
    if (!r.date) return;
    const key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
    evolMap.set(key, (evolMap.get(key) ?? 0) + r.quantidade);
  });
  const evolData = Array.from(evolMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => {
      const [y, m] = k.split("-");
      return {
        label: `${MONTHS[Number(m) - 1]}/${y.slice(2)}`,
        realizado: v,
        meta: metaGlobal,
      };
    });
  // Cumulative
  let acc = 0;
  const evolAcc = evolData.map((d) => {
    acc += d.realizado;
    return { ...d, acumulado: acc };
  });

  // Setor breakdown
  const setorMap = new Map<string, number>();
  filtered.forEach((r) => setorMap.set(r.setor, (setorMap.get(r.setor) ?? 0) + r.quantidade));
  const setorRanking = Array.from(setorMap.entries())
    .map(([setor, realizado]) => {
      const meta = metaBySetor.get(setor) ?? 0;
      const pct = meta ? (realizado / meta) * 100 : 0;
      return { setor, meta, realizado, pct, gap: realizado - meta, status: statusForPct(pct) };
    })
    .sort((a, b) => b.realizado - a.realizado);

  // Procedimento breakdown
  const procMap = new Map<string, number>();
  filtered.forEach((r) =>
    procMap.set(r.procedimento, (procMap.get(r.procedimento) ?? 0) + r.quantidade),
  );
  const procRanking = Array.from(procMap.entries())
    .map(([procedimento, realizado]) => ({ procedimento, realizado }))
    .sort((a, b) => b.realizado - a.realizado);

  const top10Setores = setorRanking.slice(0, 10);
  const piores10Setores = [...setorRanking]
    .filter((s) => s.meta > 0)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 10);
  const top10Procs = procRanking.slice(0, 10);

  // Participação
  const totalForShare = Array.from(setorMap.values()).reduce((s, v) => s + v, 0) || 1;
  const setorShare = Array.from(setorMap.entries())
    .map(([name, value]) => ({ name, value, pct: (value / totalForShare) * 100 }))
    .sort((a, b) => b.value - a.value);

  // Alertas
  const alertas: { tipo: "crit" | "warn"; msg: string }[] = [];
  setorRanking.forEach((s) => {
    if (s.meta > 0 && s.pct < 60) alertas.push({ tipo: "crit", msg: `${s.setor} atingiu apenas ${fmtPct(s.pct)} da meta.` });
    else if (s.meta > 0 && s.pct < 90) alertas.push({ tipo: "warn", msg: `${s.setor} está em ${fmtPct(s.pct)} da meta — atenção.` });
  });
  if (metaGlobal > 0 && projecaoMes < metaGlobal && diasRestantes > 0)
    alertas.push({ tipo: "warn", msg: `Meta mensal em risco — projeção indica ${fmtPct((projecaoMes / metaGlobal) * 100)} ao final do mês.` });

  // Insights
  const insights: string[] = [];
  if (metaGlobal > 0) {
    if (pctMeta >= 100) insights.push(`Meta global superada em ${fmtPct(pctMeta - 100)}.`);
    else insights.push(`A operação está em ${fmtPct(pctMeta)} da meta global — faltam ${fmtInt(faltante)} unidades.`);
  }
  if (setorRanking[0]) insights.push(`${setorRanking[0].setor} lidera a produção com ${fmtInt(setorRanking[0].realizado)} unidades.`);
  const top3 = procRanking.slice(0, 3).reduce((s, p) => s + p.realizado, 0);
  if (totalProducao > 0)
    insights.push(`Os 3 principais procedimentos representam ${fmtPct((top3 / totalProducao) * 100)} da produção total.`);
  if (mediaDiaria > 0 && diasRestantes > 0)
    insights.push(`Ritmo atual de ${fmtInt(mediaDiaria)} unidades/dia — projeção de fechamento: ${fmtInt(projecaoMes)}.`);
  if (variacao !== 0)
    insights.push(`Mês atual ${variacao >= 0 ? "cresceu" : "recuou"} ${fmtPct(Math.abs(variacao))} vs. mês anterior.`);

  // Export
  function buildExportRows() {
    return filtered.map((r) => ({
      Data: r.date?.toLocaleDateString("pt-BR") ?? "",
      Setor: r.setor,
      Procedimento: r.procedimento,
      Quantidade: r.quantidade,
      Meta_Setor: metaBySetor.get(r.setor) ?? 0,
    }));
  }
  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(buildExportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    const metasWs = XLSX.utils.json_to_sheet(metas);
    XLSX.utils.book_append_sheet(wb, metasWs, "Metas");
    XLSX.writeFile(wb, `dashboard-hospitalar-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  function exportCSV() {
    const ws = XLSX.utils.json_to_sheet(buildExportRows());
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard-hospitalar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportPDF() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Indicadores Faturamento HSAP", 14, 16);
    doc.setFontSize(10);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 23);
    autoTable(doc, {
      startY: 30,
      head: [["Setor", "Meta", "Realizado", "%", "Gap", "Status"]],
      body: setorRanking.map((s) => [
        s.setor,
        fmtInt(s.meta),
        fmtInt(s.realizado),
        fmtPct(s.pct),
        fmtInt(s.gap),
        statusLabel(s.status),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 60, 90] },
    });
    doc.save(`dashboard-hospitalar-${new Date().toISOString().slice(0, 10)}.pdf`);
  }
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header
        onRefresh={() => window.location.reload()}
        loading={query.isFetching}
        fetchedAt={data?.fetchedAt}
        exportOpen={exportOpen}
        setExportOpen={setExportOpen}
        exportExcel={exportExcel}
        exportCSV={exportCSV}
        exportPDF={exportPDF}
        onEditMetas={() => setPasswordModalOpen(true)}
        theme={theme}
        setTheme={setTheme}
      />

      {passwordModalOpen && (
        <PasswordModal
          onClose={() => setPasswordModalOpen(false)}
          onSuccess={() => {
            setPasswordModalOpen(false);
            setMetasModalOpen(true);
          }}
        />
      )}

      {metasModalOpen && (
        <MetasEditorModal
          metas={metas}
          allSetores={allSetores}
          onSave={updateMetas}
          onClose={() => setMetasModalOpen(false)}
        />
      )}

      <main className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-6 lg:px-8">
        <FiltersBar
          allYears={allYears}
          allSetores={allSetores}
          allProcs={allProcs}
          selMonths={selMonths}
          setSelMonths={setSelMonths}
          selYears={selYears}
          setSelYears={setSelYears}
          selSetores={selSetores}
          setSelSetores={setSelSetores}
          selProcs={selProcs}
          setSelProcs={setSelProcs}
        />

        {query.isLoading && <LoadingState />}
        {query.isError && (
          <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive-foreground">
            Não foi possível carregar a planilha. Verifique se está pública e tente atualizar.
          </div>
        )}

        {data && (
          <>
            {/* KPIs */}
            <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
              <KpiCard label="Produção Total" value={fmtInt(totalProducao)} icon={<Activity className="h-4 w-4" />} accent="primary" />
              <KpiCard label="Registros" value={fmtInt(totalRegistros)} icon={<Calendar className="h-4 w-4" />} />
              <KpiCard label="Ticket Médio" value={fmtInt(ticketMedio)} hint="unid. / registro" />
              <KpiCard
                label="Crescimento (m/m)"
                value={fmtPct(variacao)}
                icon={variacao >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                accent={variacao >= 0 ? "success" : "destructive"}
              />
              <KpiCard label="Meta Global" value={fmtInt(metaGlobal)} icon={<Target className="h-4 w-4" />} />
              <KpiCard label="Realizado" value={fmtInt(totalProducao)} />
              <KpiCard label="% da Meta" value={fmtPct(pctMeta)} accent={pctMeta >= 100 ? "success" : pctMeta >= 70 ? "primary" : "destructive"} />
              <KpiCard label="Projeção de Fechamento" value={fmtInt(projecaoMes)} hint={`prob.: ${probMeta}`} />
            </section>

            {/* Central de Metas */}
            <SectionTitle title="Central de Metas" subtitle="Acompanhamento global, mensal e por setor" />
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <MetaCard title="Meta Global" meta={metaGlobal} realizado={totalProducao} />
              <MetaCard title="Meta Mensal (mês corrente)" meta={metaGlobal} realizado={producaoMesAtual} extraLine={`Faltante: ${fmtInt(Math.max(0, metaGlobal - producaoMesAtual))}`} />
              <MetaCard title="Meta Acumulada" meta={metaGlobal * Math.max(1, evolData.length)} realizado={evolAcc.at(-1)?.acumulado ?? totalProducao} />
            </section>

            {/* Gauges */}
            <SectionTitle title="Medidores por Setor" />
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {setorRanking.filter((s) => s.meta > 0).map((s) => (
                <Gauge key={s.setor} label={s.setor} pct={s.pct} />
              ))}
              {!setorRanking.some((s) => s.meta > 0) && (
                <p className="col-span-full text-sm text-muted-foreground">Nenhuma meta cadastrada na aba de metas.</p>
              )}
            </section>

            {/* Evolução */}
            <SectionTitle title="Evolução Temporal" subtitle="Realizado vs. Meta e acumulado" />
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard title="Produção por Mês — Meta x Realizado">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={evolData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Line type="monotone" dataKey="realizado" stroke="var(--chart-1)" strokeWidth={3} name="Realizado" dot={false} />
                    <Line type="monotone" dataKey="meta" stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="5 5" name="Meta" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Evolução Acumulada">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={evolAcc}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Line type="monotone" dataKey="acumulado" stroke="var(--chart-2)" strokeWidth={3} name="Acumulado" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </section>

            {/* Gap e Projeção */}
            <SectionTitle title="Análise de Gap & Projeção Inteligente" />
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <InfoCard label="Meta (mês)" value={fmtInt(metaGlobal)} />
              <InfoCard label="Realizado (mês)" value={fmtInt(producaoMesAtual)} />
              <InfoCard label="Faltante" value={fmtInt(Math.max(0, metaGlobal - producaoMesAtual))} accent="warning" />
              <InfoCard label="Dias Restantes" value={String(diasRestantes)} />
              <InfoCard label="Média Diária Atual" value={fmtInt(mediaDiaria)} />
              <InfoCard label="Necessário / Dia" value={fmtInt(Math.max(0, necessarioPorDia))} accent="primary" />
              <InfoCard label="Projeção de Fechamento" value={fmtInt(projecaoMes)} />
              <InfoCard label="Probabilidade da Meta" value={probMeta} accent={probMeta === "Alta" ? "success" : probMeta === "Média" ? "warning" : "destructive"} />
            </section>

            {/* Rankings */}
            <SectionTitle title="Ranking de Setores" />
            <RankingTable
              rows={setorRanking.map((s, i) => ({
                pos: i + 1,
                nome: s.setor,
                meta: s.meta,
                realizado: s.realizado,
                pct: s.pct,
                diff: s.gap,
                status: s.status,
              }))}
            />

            <SectionTitle title="Ranking de Procedimentos" />
            <ChartCard title="Top 10 Procedimentos por Produção">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={top10Procs} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis type="category" dataKey="procedimento" stroke="var(--muted-foreground)" fontSize={11} width={140} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="realizado" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Top performers / piores */}
            <SectionTitle title="Top Performers & Piores Resultados" />
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ListCard title="🏆 Top 10 Setores" items={top10Setores.map((s) => ({ name: s.setor, value: fmtInt(s.realizado), sub: `${fmtPct(s.pct)} da meta` }))} />
              <ListCard title="⚠️ 10 Setores Mais Abaixo da Meta" items={piores10Setores.map((s) => ({ name: s.setor, value: fmtPct(s.pct), sub: `Gap: ${fmtInt(s.gap)}` }))} />
            </section>

            {/* Participação */}
            <SectionTitle title="Análise de Participação" />
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard title="Participação por Setor">
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={setorShare} dataKey="value" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={2}>
                      {setorShare.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtInt(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Participação por Procedimento (Top 8)">
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={procRanking.slice(0, 8)} dataKey="realizado" nameKey="procedimento" innerRadius={60} outerRadius={110} paddingAngle={2}>
                      {procRanking.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtInt(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </section>

            {/* Alertas & Insights */}
            <SectionTitle title="Alertas & Insights Automáticos" />
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-gradient-card p-5 shadow-elevated">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Alertas Automáticos
                </div>
                {alertas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum alerta no momento.</p>
                ) : (
                  <ul className="space-y-2">
                    {alertas.slice(0, 8).map((a, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-lg bg-background/40 p-3 text-sm">
                        <span className="mt-0.5">{a.tipo === "crit" ? "🔴" : "🟡"}</span>
                        <span>{a.msg}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-border bg-gradient-card p-5 shadow-elevated">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Insights
                </div>
                <ul className="space-y-2">
                  {insights.map((it, i) => (
                    <li key={i} className="rounded-lg bg-background/40 p-3 text-sm leading-relaxed">{it}</li>
                  ))}
                </ul>
              </div>
            </section>

            {/* Tabela analítica */}
            <SectionTitle title="Tabela Analítica" subtitle="Detalhamento por registro com filtros atuais" />
            <AnalyticalTable rows={filtered} metaBySetor={metaBySetor} />
          </>
        )}
      </main>

      <footer className="mx-auto max-w-[1600px] px-4 pb-8 text-xs text-muted-foreground sm:px-6 lg:px-8">
        Fonte: <a className="underline hover:text-foreground" href={SHEET_URL} target="_blank" rel="noreferrer">planilha mestre</a> · Os dados são lidos diretamente do Google Sheets em tempo real.
      </footer>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--foreground)",
  fontSize: 12,
};

/* ---------- Header ---------- */

function Header(props: {
  onRefresh: () => void;
  loading: boolean;
  fetchedAt?: Date;
  exportOpen: boolean;
  setExportOpen: (v: boolean) => void;
  exportExcel: () => void;
  exportCSV: () => void;
  exportPDF: () => void;
  onEditMetas: () => void;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-primary shadow-glow">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-bold leading-tight sm:text-xl">
              Indicadores Faturamento HSAP
            </h1>
            <p className="truncate text-xs text-muted-foreground sm:text-sm">
              Gestão de Produção, Metas e Performance
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => props.setTheme(props.theme === "light" ? "dark" : "light")}
            className="inline-flex items-center justify-center rounded-lg border border-border bg-card p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Alternar Tema"
          >
            {props.theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          <button
            onClick={props.onRefresh}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent"
          >
            <RefreshCw className={`h-4 w-4 ${props.loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <div className="relative">
            <button
              onClick={() => props.setExportOpen(!props.exportOpen)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-accent"
            >
              <Download className="h-4 w-4" /> Exportar <ChevronDown className="h-3 w-3" />
            </button>
            {props.exportOpen && (
              <div
                className="absolute right-0 z-40 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-card shadow-elevated"
                onMouseLeave={() => props.setExportOpen(false)}
              >
                <button onClick={() => { props.exportExcel(); props.setExportOpen(false); }} className="block w-full px-3 py-2 text-left text-xs hover:bg-accent">Excel (.xlsx)</button>
                <button onClick={() => { props.exportCSV(); props.setExportOpen(false); }} className="block w-full px-3 py-2 text-left text-xs hover:bg-accent">CSV</button>
                <button onClick={() => { props.exportPDF(); props.setExportOpen(false); }} className="block w-full px-3 py-2 text-left text-xs hover:bg-accent">PDF</button>
              </div>
            )}
          </div>
          <button
            onClick={props.onEditMetas}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
            title="Editar Metas"
          >
            <Pencil className="h-4 w-4" />
            Editar Metas
          </button>
          <a
            href={FORM_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-glow hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Novo Registro
          </a>
        </div>
      </div>
    </header>
  );
}

/* ---------- Filters ---------- */

function FiltersBar(p: {
  allYears: number[];
  allSetores: string[];
  allProcs: string[];
  selMonths: number[]; setSelMonths: (v: number[]) => void;
  selYears: number[]; setSelYears: (v: number[]) => void;
  selSetores: string[]; setSelSetores: (v: string[]) => void;
  selProcs: string[]; setSelProcs: (v: string[]) => void;
}) {
  const clear = () => {
    p.setSelMonths([]); p.setSelYears([]); p.setSelSetores([]); p.setSelProcs([]);
  };
  return (
    <div className="mt-5 rounded-xl border border-border bg-gradient-card p-4 shadow-elevated">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MultiSelect label="Mês" options={MONTHS_FULL.map((m, i) => ({ value: i, label: m }))} selected={p.selMonths} onChange={p.setSelMonths} />
        <MultiSelect label="Ano" options={p.allYears.map((y) => ({ value: y, label: String(y) }))} selected={p.selYears} onChange={p.setSelYears} />
        <MultiSelect label="Setor" options={p.allSetores.map((s) => ({ value: s, label: s }))} selected={p.selSetores} onChange={p.setSelSetores} />
        <MultiSelect label="Procedimento" options={p.allProcs.map((s) => ({ value: s, label: s }))} selected={p.selProcs} onChange={p.setSelProcs} />
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={clear} className="text-xs text-muted-foreground underline hover:text-foreground">Limpar filtros</button>
      </div>
    </div>
  );
}

function MultiSelect<T extends string | number>(props: {
  label: string;
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (v: T[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = props.selected.length === 0 ? "Todos" : `${props.selected.length} selecionado(s)`;
  const toggle = (val: T) => {
    if (props.selected.includes(val)) props.onChange(props.selected.filter((v) => v !== val));
    else props.onChange([...props.selected, val]);
  };
  return (
    <div className="relative">
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{props.label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-input px-3 py-2 text-left text-xs text-foreground hover:border-primary"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover p-2 shadow-elevated">
          {props.options.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Sem opções</p>}
          {props.options.map((o) => (
            <label key={String(o.value)} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent">
              <input
                type="checkbox"
                checked={props.selected.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="accent-primary"
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
          <button onClick={() => { props.onChange([]); setOpen(false); }} className="mt-1 w-full rounded px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-accent">
            Limpar
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Building blocks ---------- */

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3 mt-8">
      <h2 className="font-display text-base font-bold sm:text-lg">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function KpiCard({
  label, value, hint, icon, accent = "default",
}: { label: string; value: string; hint?: string; icon?: React.ReactNode; accent?: "default" | "primary" | "success" | "destructive" | "warning" }) {
  const accentBar = accent === "primary" ? "bg-primary" : accent === "success" ? "bg-success" : accent === "destructive" ? "bg-destructive" : accent === "warning" ? "bg-warning" : "bg-border";
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-card p-4 shadow-elevated">
      <span className={`absolute left-0 top-0 h-full w-1 ${accentBar}`} />
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className="mt-2 font-display text-2xl font-bold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function InfoCard({ label, value, accent }: { label: string; value: string; accent?: "primary" | "success" | "warning" | "destructive" }) {
  const c = accent === "primary" ? "text-primary" : accent === "success" ? "text-success" : accent === "warning" ? "text-warning" : accent === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-gradient-card p-4 shadow-elevated">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-xl font-bold ${c}`}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-gradient-card p-5 shadow-elevated">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function MetaCard({ title, meta, realizado, extraLine }: { title: string; meta: number; realizado: number; extraLine?: string }) {
  const pct = meta ? (realizado / meta) * 100 : 0;
  const status = statusForPct(pct);
  const diff = realizado - meta;
  return (
    <div className="rounded-xl border border-border bg-gradient-card p-5 shadow-elevated">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `color-mix(in oklab, ${statusColor(status)} 20%, transparent)`, color: statusColor(status) }}>
          {statusLabel(status)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[11px] text-muted-foreground">Meta</div>
          <div className="font-display text-lg font-bold">{fmtInt(meta)}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Realizado</div>
          <div className="font-display text-lg font-bold">{fmtInt(realizado)}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">% Meta</div>
          <div className="font-display text-lg font-bold" style={{ color: statusColor(status) }}>{fmtPct(pct)}</div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Diferença</div>
          <div className={`font-display text-lg font-bold ${diff >= 0 ? "text-success" : "text-destructive"}`}>{fmtInt(diff)}</div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/60">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: statusColor(status) }} />
      </div>
      {extraLine && <div className="mt-2 text-[11px] text-muted-foreground">{extraLine}</div>}
    </div>
  );
}

function Gauge({ label, pct }: { label: string; pct: number }) {
  const status = statusForPct(pct);
  const color = statusColor(status);
  const value = Math.min(pct, 120);
  const data = [{ name: label, value, fill: color }];
  const pctStr = fmtPct(pct);
  const textClass = pctStr.length > 6 ? "text-base" : "text-xl";
  return (
    <div className="rounded-xl border border-border bg-gradient-card p-3 shadow-elevated">
      <div className="relative h-32">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="80%" outerRadius="100%" data={data} startAngle={210} endAngle={-30} cx="50%" cy="55%">
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background={{ fill: "var(--accent)" }} dataKey="value" cornerRadius={6} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
          <span className={`font-display font-bold leading-none ${textClass}`} style={{ color }}>{pctStr}</span>
          <span className="mt-1 text-[10px] font-medium text-muted-foreground">{statusLabel(status)}</span>
        </div>
      </div>
      <div className="mt-1 truncate text-center text-xs font-medium">{label}</div>
    </div>
  );
}

function RankingTable({
  rows,
}: { rows: { pos: number; nome: string; meta: number; realizado: number; pct: number; diff: number; status: ReturnType<typeof statusForPct> }[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-gradient-card shadow-elevated">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-background/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Setor</th>
              <th className="px-3 py-2 text-right">Meta</th>
              <th className="px-3 py-2 text-right">Realizado</th>
              <th className="px-3 py-2 text-right">%</th>
              <th className="px-3 py-2 text-right">Diferença</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.nome} className="border-t border-border/60 hover:bg-background/30">
                <td className="px-3 py-2 text-muted-foreground">{r.pos}</td>
                <td className="px-3 py-2 font-medium">{r.nome}</td>
                <td className="px-3 py-2 text-right">{fmtInt(r.meta)}</td>
                <td className="px-3 py-2 text-right">{fmtInt(r.realizado)}</td>
                <td className="px-3 py-2 text-right font-semibold" style={{ color: statusColor(r.status) }}>{fmtPct(r.pct)}</td>
                <td className={`px-3 py-2 text-right ${r.diff >= 0 ? "text-success" : "text-destructive"}`}>{fmtInt(r.diff)}</td>
                <td className="px-3 py-2"><span className="mr-1">{statusDot(r.status)}</span>{statusLabel(r.status)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Sem dados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: { name: string; value: string; sub?: string }[] }) {
  return (
    <div className="rounded-xl border border-border bg-gradient-card p-5 shadow-elevated">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <ol className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-background/40">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-background/60 text-[11px] font-bold text-muted-foreground">{i + 1}</span>
              <div className="min-w-0">
                <div className="truncate font-medium">{it.name}</div>
                {it.sub && <div className="text-[11px] text-muted-foreground">{it.sub}</div>}
              </div>
            </div>
            <div className="font-display font-bold">{it.value}</div>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-muted-foreground">Sem dados.</li>}
      </ol>
    </div>
  );
}

function AnalyticalTable({ rows, metaBySetor }: { rows: RawRecord[]; metaBySetor: Map<string, number> }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<"date" | "setor" | "procedimento" | "quantidade">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const pageSize = 15;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => r.setor.toLowerCase().includes(q) || r.procedimento.toLowerCase().includes(q))
      : rows;
    const sorted = [...base].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0);
      else if (sortKey === "quantidade") cmp = a.quantidade - b.quantidade;
      else cmp = a[sortKey].localeCompare(b[sortKey]);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);

  function toggleSort(k: typeof sortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }
  const SortH = ({ k, children }: { k: typeof sortKey; children: React.ReactNode }) => (
    <th onClick={() => toggleSort(k)} className="cursor-pointer select-none px-3 py-2 hover:text-foreground">
      {children}{sortKey === k && (sortDir === "asc" ? " ▲" : " ▼")}
    </th>
  );

  return (
    <div className="rounded-xl border border-border bg-gradient-card p-4 shadow-elevated">
      <div className="mb-3 flex items-center justify-between gap-2">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Pesquisar setor ou procedimento..."
          className="w-full max-w-sm rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground"
        />
        <span className="text-xs text-muted-foreground">{filtered.length} registros</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-background/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <SortH k="date">Data</SortH>
              <SortH k="setor">Setor</SortH>
              <SortH k="procedimento">Procedimento</SortH>
              <SortH k="quantidade">Quantidade</SortH>
              <th className="px-3 py-2 text-right">Meta Setor</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={i} className="border-t border-border/60 hover:bg-background/30">
                <td className="px-3 py-2">{r.date?.toLocaleDateString("pt-BR")}</td>
                <td className="px-3 py-2">{r.setor}</td>
                <td className="px-3 py-2">{r.procedimento}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtInt(r.quantidade)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{fmtInt(metaBySetor.get(r.setor) ?? 0)}</td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Sem registros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Página {page + 1} de {totalPages}</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="rounded border border-border px-3 py-1 disabled:opacity-40 hover:bg-accent">Anterior</button>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="rounded border border-border px-3 py-1 disabled:opacity-40 hover:bg-accent">Próxima</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Password Modal ---------- */

function PasswordModal({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd === "19735") {
      onSuccess();
    } else {
      setError(true);
      setPwd("");
    }
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md"
      onClick={(e) => e.target === backdropRef.current && onClose()}
    >
      <form onSubmit={handleSubmit} className="relative w-full max-w-sm rounded-2xl border border-border bg-gradient-card p-6 shadow-elevated" style={{ animation: "modalIn 0.2s ease-out" }}>
        <h2 className="font-display text-lg font-bold">Acesso Restrito</h2>
        <p className="mt-1 text-sm text-muted-foreground">Insira a senha de administrador para editar as metas.</p>
        <input
          type="password"
          value={pwd}
          onChange={(e) => { setPwd(e.target.value); setError(false); }}
          className="mt-4 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
          autoFocus
          placeholder="Senha"
        />
        {error && <p className="mt-2 text-xs font-medium text-destructive">Senha incorreta.</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors">Cancelar</button>
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity">Acessar</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Metas Editor Modal ---------- */

function MetasEditorModal({
  metas: currentMetas,
  allSetores,
  onSave,
  onClose,
}: {
  metas: MetaRecord[];
  allSetores: string[];
  onSave: (metas: MetaRecord[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<{ setor: string; meta: number; isNew?: boolean }[]>(() => {
    const currentMap = new Map(currentMetas.map((m) => [m.setor, m.meta]));
    const initialRows = allSetores.map((setor) => ({
      setor,
      meta: currentMap.get(setor) ?? 0,
    }));
    
    for (const m of currentMetas) {
      if (!allSetores.includes(m.setor)) {
        initialRows.push({ setor: m.setor, meta: m.meta });
      }
    }
    
    return initialRows.sort((a, b) => a.setor.localeCompare(b.setor));
  });
  const [saved, setSaved] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  function handleMetaChange(setor: string, value: string) {
    const num = Number(value.replace(/[^\d]/g, ""));
    setRows((prev) => prev.map((r) => (r.setor === setor ? { ...r, meta: isNaN(num) ? 0 : num } : r)));
  }

  function handleDelete(setor: string) {
    setRows((prev) => prev.map((r) => (r.setor === setor ? { ...r, meta: 0 } : r)));
  }

  function handleSave() {
    onSave(rows.map(({ setor, meta }) => ({ setor, meta })));
    setSaved(true);
    setTimeout(() => onClose(), 600);
  }

  const hasChanges = useMemo(() => {
    const currentMap = new Map(currentMetas.map((m) => [m.setor, m.meta]));
    if (rows.length !== currentMetas.length) return true;
    for (const r of rows) {
      if (currentMap.get(r.setor) !== r.meta) return true;
    }
    return false;
  }, [rows, currentMetas]);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md"
      onClick={(e) => e.target === backdropRef.current && onClose()}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-gradient-card shadow-elevated"
        style={{ animation: "modalIn 0.25s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary shadow-glow">
              <Target className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold">Editar Metas</h2>
              <p className="text-xs text-muted-foreground">Defina os valores de meta por setor</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-accent transition-colors" title="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-accent/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Setor</th>
                  <th className="px-4 py-2.5 text-right">Meta (valor)</th>
                  <th className="px-4 py-2.5 text-center w-20">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.setor} className="border-t border-border/40 hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium">
                      <div className="flex items-center gap-2">
                        {r.setor}
                        {r.isNew && (
                          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary">NOVO</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        value={r.meta === 0 ? "" : r.meta.toString()}
                        onChange={(e) => handleMetaChange(r.setor, e.target.value)}
                        className="w-full rounded-lg border border-border bg-input px-3 py-1.5 text-right text-sm font-display font-bold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => handleDelete(r.setor)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Limpar valor"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Nenhuma meta cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-glow hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {saved ? (
                <>✓ Salvo!</>
              ) : (
                <><Save className="h-3.5 w-3.5" /> Salvar Metas</>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-gradient-card" />
      ))}
    </div>
  );
}
