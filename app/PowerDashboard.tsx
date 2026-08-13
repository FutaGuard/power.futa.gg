"use client";

import {
  ArrowRight,
  ArrowUpRight,
  BatteryCharging,
  Bolt,
  Check,
  ChevronDown,
  ChevronRight,
  CircleGauge,
  CloudSun,
  ExternalLink,
  Factory,
  Flame,
  Gauge,
  Info,
  Leaf,
  LoaderCircle,
  Menu,
  Moon,
  Mountain,
  RefreshCw,
  Search,
  Sun,
  Waves,
  Wind,
  X,
  Zap,
} from "lucide-react";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import { feature as topoFeature } from "topojson-client";
import {
  type CSSProperties,
  type ComponentType,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

const API_BASE = "https://opendata.futa.gg";
const TAIPEI_TIME_ZONE = "Asia/Taipei";

type ConnectionState = "loading" | "live" | "offline";
type RegionKey = "north" | "central" | "south" | "east";
type GeneratorFilter = "all" | "running" | "stopped" | "limited";
type GeneratorStatusTone = "is-running" | "is-limited" | "is-outage" | "is-alert" | "is-stopped";
type LoadMode = "total" | "regions";

interface PowerSnapshot {
  id: number;
  published_at: string;
  current_load_mw: number | null;
  current_utilization_percent: number | null;
  forecast_max_supply_mw: number | null;
  forecast_peak_demand_mw: number | null;
  forecast_peak_reserve_mw: number | null;
  forecast_peak_reserve_rate_percent: number | null;
  forecast_peak_reserve_indicator: string | null;
  forecast_peak_hour_range: string | null;
  yesterday_date: string | null;
  yesterday_peak_demand_mw: number | null;
  yesterday_peak_reserve_rate_percent: number | null;
}

interface FuelMix {
  id: number;
  observed_at: string;
  lng_mw: number;
  ipp_lng_mw: number;
  coal_mw: number;
  ipp_coal_mw: number;
  cogeneration_mw: number;
  fuel_oil_mw: number;
  solar_mw: number;
  wind_mw: number;
  hydro_mw: number;
  energy_storage_mw: number;
  other_renewable_mw: number;
  energy_storage_load_mw: number;
  total_mw: number;
}

interface AreaLoad {
  id: number;
  observed_at: string;
  north_load_mw: number;
  central_load_mw: number;
  south_load_mw: number;
  east_load_mw: number;
  total_load_mw: number;
}

interface AreaSnapshot {
  id: number;
  observed_at: string;
  north_generation_mw: number;
  north_load_mw: number;
  central_generation_mw: number;
  central_load_mw: number;
  south_generation_mw: number;
  south_load_mw: number;
  east_generation_mw: number;
  east_load_mw: number;
}

interface GeneratorRecord {
  id: number;
  published_at: string;
  sequence: number;
  category_code: string;
  category: string;
  unit_name: string;
  installed_capacity_mw: number | null;
  net_generation_mw: number | null;
  utilization_percent: number | null;
  status: string | null;
  is_summary: boolean;
}

interface DashboardData {
  power: PowerSnapshot;
  fuelMix: FuelMix[];
  areaLoads: AreaLoad[];
  areaSnapshot: AreaSnapshot;
  generators: GeneratorRecord[];
}

interface FuelDefinition {
  key: string;
  label: string;
  color: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  getValue: (mix: FuelMix) => number;
}

interface RegionDefinition {
  key: RegionKey;
  label: string;
  color: string;
  generation: number;
  load: number;
  difference: number;
}

const fuelDefinitions: FuelDefinition[] = [
  {
    key: "gas",
    label: "燃氣",
    color: "#2487f3",
    icon: Flame,
    getValue: (mix) => mix.lng_mw + mix.ipp_lng_mw,
  },
  {
    key: "coal",
    label: "燃煤",
    color: "#f0642d",
    icon: Factory,
    getValue: (mix) => mix.coal_mw + mix.ipp_coal_mw,
  },
  {
    key: "solar",
    label: "太陽能",
    color: "#f5b900",
    icon: Sun,
    getValue: (mix) => mix.solar_mw,
  },
  {
    key: "wind",
    label: "風力",
    color: "#35b779",
    icon: Wind,
    getValue: (mix) => mix.wind_mw,
  },
  {
    key: "hydro",
    label: "水力",
    color: "#25a7c7",
    icon: Waves,
    getValue: (mix) => mix.hydro_mw,
  },
  {
    key: "other",
    label: "其他",
    color: "#7773c7",
    icon: Leaf,
    getValue: (mix) =>
      mix.cogeneration_mw +
      mix.fuel_oil_mw +
      mix.energy_storage_mw +
      mix.other_renewable_mw,
  },
];

const regionMeta: Record<RegionKey, { label: string; color: string }> = {
  north: { label: "北部", color: "#3d86e8" },
  central: { label: "中部", color: "#35b779" },
  south: { label: "南部", color: "#f2a93b" },
  east: { label: "東部", color: "#8a79db" },
};

const countyRegions: Record<string, RegionKey> = {
  台北市: "north",
  新北市: "north",
  基隆市: "north",
  桃園縣: "north",
  新竹縣: "north",
  新竹市: "north",
  宜蘭縣: "north",
  苗栗縣: "central",
  台中市: "central",
  彰化縣: "central",
  南投縣: "central",
  雲林縣: "central",
  嘉義縣: "south",
  嘉義市: "south",
  台南市: "south",
  高雄市: "south",
  屏東縣: "south",
  澎湖縣: "south",
  花蓮縣: "east",
  台東縣: "east",
};

const fallbackPower: PowerSnapshot = {
  id: 1,
  published_at: "2026-08-13T03:50:00Z",
  current_load_mw: 39515,
  current_utilization_percent: 80,
  forecast_max_supply_mw: 48781,
  forecast_peak_demand_mw: 41100,
  forecast_peak_reserve_mw: 7681,
  forecast_peak_reserve_rate_percent: 18.69,
  forecast_peak_reserve_indicator: "G",
  forecast_peak_hour_range: "13:00–16:00",
  yesterday_date: "2026-08-12",
  yesterday_peak_demand_mw: 40882,
  yesterday_peak_reserve_rate_percent: 15.69,
};

function makeFallbackCurves(): Pick<DashboardData, "fuelMix" | "areaLoads"> {
  const fuelMix: FuelMix[] = [];
  const areaLoads: AreaLoad[] = [];
  for (let index = 0; index <= 71; index += 1) {
    const hour = index / 6;
    const rise = 1 / (1 + Math.exp(-(hour - 7.4) * 0.9));
    const midday = Math.exp(-Math.pow((hour - 13.2) / 5.6, 2));
    const total = Math.round(24400 + rise * 9200 + midday * 6200);
    const solar = Math.max(0, Math.round(8300 * Math.sin((Math.PI * (hour - 5.6)) / 12.3)));
    const timestamp = new Date(Date.UTC(2026, 7, 12, 16, index * 10)).toISOString();
    areaLoads.push({
      id: index,
      observed_at: timestamp,
      north_load_mw: Math.round(total * 0.392),
      central_load_mw: Math.round(total * 0.265),
      south_load_mw: Math.round(total * 0.328),
      east_load_mw: Math.round(total * 0.015),
      total_load_mw: total,
    });
    fuelMix.push({
      id: index,
      observed_at: timestamp,
      lng_mw: Math.round(total * 0.37),
      ipp_lng_mw: Math.round(total * 0.125),
      coal_mw: Math.round(total * 0.18),
      ipp_coal_mw: Math.round(total * 0.03),
      cogeneration_mw: Math.round(total * 0.055),
      fuel_oil_mw: Math.round(total * 0.009),
      solar_mw: solar,
      wind_mw: Math.round(total * 0.024),
      hydro_mw: Math.round(total * 0.016),
      energy_storage_mw: 40,
      other_renewable_mw: 39,
      energy_storage_load_mw: -Math.max(0, solar - 7200),
      total_mw: total,
    });
  }
  return { fuelMix, areaLoads };
}

const fallbackCurves = makeFallbackCurves();

const fallbackArea: AreaSnapshot = {
  id: 1,
  observed_at: "2026-08-13T03:50:00Z",
  north_generation_mw: 12849,
  north_load_mw: 15480,
  central_generation_mw: 11661,
  central_load_mw: 10470,
  south_generation_mw: 14758,
  south_load_mw: 12969,
  east_generation_mw: 247,
  east_load_mw: 596,
};

const fallbackGenerators: GeneratorRecord[] = [
  [1, "大潭CC#1", "lng", "燃氣(LNG)", 742.7, 386.2, 52, "運轉限制"],
  [2, "大潭CC#7", "lng", "燃氣(LNG)", 1300, 1128, 86.8, null],
  [3, "台中#10", "coal", "燃煤(Coal)", 550, 512, 93.1, null],
  [4, "林口#3", "coal", "燃煤(Coal)", 800, 742, 92.8, null],
  [5, "通霄CC#1", "lng", "燃氣(LNG)", 892.6, 786, 88.1, null],
  [6, "興達新CC#1", "lng", "燃氣(LNG)", 1300, 1140, 87.7, null],
  [7, "明潭水力#1", "hydro", "水力(Hydro)", 267, 0, 0, "計劃停機"],
  [8, "台南鹽田太陽光電", "solar", "太陽能(Solar)", 150, 116, 77.3, null],
].map(([id, unit, code, category, capacity, generation, utilization, status], index) => ({
  id: id as number,
  published_at: "2026-08-13T03:40:00Z",
  sequence: index,
  category_code: code as string,
  category: category as string,
  unit_name: unit as string,
  installed_capacity_mw: capacity as number,
  net_generation_mw: generation as number,
  utilization_percent: utilization as number,
  status: status as string | null,
  is_summary: false,
}));

const fallbackData: DashboardData = {
  power: fallbackPower,
  ...fallbackCurves,
  areaSnapshot: fallbackArea,
  generators: fallbackGenerators,
};

function dateKey(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TAIPEI_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TAIPEI_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function timeMinutes(iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TAIPEI_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  return values.hour * 60 + values.minute;
}

function getReserveLabel(rate: number | null, indicator: string | null) {
  if (indicator === "G" || (rate !== null && rate >= 10)) return "供電充裕";
  if (indicator === "Y" || (rate !== null && rate >= 6)) return "供電吃緊";
  if (indicator === "O") return "供電警戒";
  if (indicator === "R") return "限電警戒";
  return "供電資訊更新中";
}

function getGeneratorDisplayStatus(unit: GeneratorRecord): {
  label: string;
  tone: GeneratorStatusTone;
  description: string;
} {
  const generation = unit.net_generation_mw ?? 0;
  const note = unit.status?.trim();

  if (note) {
    if (/^(正常|運轉中|發電中)$/.test(note)) {
      return { label: note, tone: "is-running", description: "正常發電" };
    }
    if (/(故障|異常|事故|跳機|破管|緊急|警報|解聯)/.test(note)) {
      return { label: note, tone: "is-alert", description: "異常狀態" };
    }
    if (/(停機|檢修|歲修|除役|停用|待機|停役|暫停)/.test(note)) {
      return { label: note, tone: "is-outage", description: "停機或檢修" };
    }
    return { label: note, tone: "is-limited", description: "有運轉註記" };
  }

  if (generation > 0) {
    return { label: "發電中", tone: "is-running", description: "正常發電" };
  }
  return { label: "未發電", tone: "is-stopped", description: "目前沒有發電" };
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    signal,
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json() as Promise<T>;
}

function nearestByTime<T extends { observed_at: string }>(items: T[], iso: string | null) {
  if (!items.length) return null;
  if (!iso) return items[items.length - 1];
  const target = new Date(iso).getTime();
  return items.reduce((closest, item) =>
    Math.abs(new Date(item.observed_at).getTime() - target) <
    Math.abs(new Date(closest.observed_at).getTime() - target)
      ? item
      : closest,
  );
}

function linePath(
  points: AreaLoad[],
  value: (point: AreaLoad) => number,
  max: number,
  width = 760,
  height = 292,
) {
  const left = 54;
  const right = 18;
  const top = 20;
  const bottom = 35;
  return points
    .map((point, index) => {
      const x = left + (timeMinutes(point.observed_at) / 1440) * (width - left - right);
      const y = top + (1 - value(point) / max) * (height - top - bottom);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function areaPath(points: AreaLoad[], max: number) {
  if (!points.length) return "";
  const line = linePath(points, (point) => point.total_load_mw, max);
  const lastX = 54 + (timeMinutes(points[points.length - 1].observed_at) / 1440) * 688;
  const firstX = 54 + (timeMinutes(points[0].observed_at) / 1440) * 688;
  return `${line} L${lastX.toFixed(1)},257 L${firstX.toFixed(1)},257 Z`;
}

function miniLinePath(values: number[], width = 246, height = 72) {
  if (!values.length) return "";
  const maximum = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - (value / maximum) * (height - 8) - 4;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function PowerMark({ size = 42 }: { size?: number }) {
  return (
    <span className="power-mark" style={{ "--mark-size": `${size}px` } as CSSProperties}>
      <Zap size={size * 0.58} strokeWidth={2.8} aria-hidden="true" />
    </span>
  );
}

function Header({
  connection,
  updatedAt,
  isRefreshing,
  onRefresh,
  theme,
  onThemeToggle,
}: {
  connection: ConnectionState;
  updatedAt: string;
  isRefreshing: boolean;
  onRefresh: () => void;
  theme: "light" | "dark";
  onThemeToggle: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    ["今日電力", "#today"],
    ["能源組成", "#mix"],
    ["區域供需", "#regions"],
    ["發電機組", "#generators"],
  ];
  return (
    <header className="site-header">
      <a href="#top" className="brand" aria-label="回到頁面頂端">
        <PowerMark />
        <span className="brand-copy">
          <strong>台灣電力</strong>
          <small>power.futa.gg</small>
        </span>
      </a>
      <nav className={menuOpen ? "main-nav is-open" : "main-nav"} aria-label="主要導覽">
        {links.map(([label, href]) => (
          <a key={href} href={href} onClick={() => setMenuOpen(false)}>
            {label}
          </a>
        ))}
      </nav>
      <div className="header-actions">
        <button
          className="sync-button"
          onClick={onRefresh}
          type="button"
          aria-label="重新整理即時資料"
          disabled={isRefreshing}
        >
          <span className={`live-dot ${connection}`} aria-hidden="true" />
          <span className="sync-copy">
            {connection === "live" ? "即時更新" : connection === "loading" ? "連線中" : "離線資料"}
            <small>{formatTime(updatedAt)}</small>
          </span>
          <RefreshCw size={15} className={isRefreshing ? "is-spinning" : ""} aria-hidden="true" />
        </button>
        <button className="icon-button" onClick={onThemeToggle} type="button" aria-label="切換明暗模式">
          {theme === "light" ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <button
          className="icon-button menu-button"
          type="button"
          aria-label={menuOpen ? "關閉選單" : "開啟選單"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
    </header>
  );
}

function CircularGauge({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  const style = {
    "--gauge-stop": `${safeValue * 3.6}deg`,
  } as CSSProperties;
  return (
    <div className="circular-gauge" style={style} aria-label={`系統供電利用率 ${safeValue.toFixed(1)}%`}>
      <div className="gauge-center">
        <strong>{safeValue.toFixed(1)}%</strong>
        <span>供電利用率</span>
      </div>
    </div>
  );
}

function Hero({ power, connection }: { power: PowerSnapshot; connection: ConnectionState }) {
  const current = power.current_load_mw ?? 0;
  const utilization = power.current_utilization_percent ?? 0;
  const reserveRate = power.forecast_peak_reserve_rate_percent;
  const reserveLabel = getReserveLabel(reserveRate, power.forecast_peak_reserve_indicator);
  return (
    <section className="hero-section" id="today" aria-labelledby="hero-title">
      <div className="hero-sun" aria-hidden="true" />
      <div className="hero-rays" aria-hidden="true" />
      <div className="island-scene" aria-hidden="true">
        <span className="mountain mountain-back" />
        <span className="mountain mountain-front" />
        <span className="water-line" />
      </div>
      <div className="hero-copy">
        <div className="eyebrow"><CloudSun size={17} /> 島嶼日光 · 即時電力</div>
        <h1 id="hero-title">現在，台灣用了多少電？</h1>
        <div className="hero-number">
          <strong>{formatNumber(current)}</strong><span>MW</span>
        </div>
        <div className="hero-meta">
          <time dateTime={power.published_at}>{formatDateTime(power.published_at)}</time>
          <span className={`supply-pill ${connection === "offline" ? "is-offline" : ""}`}>
            {connection === "offline" ? <Info size={15} /> : <Check size={15} />}
            {connection === "offline" ? "暫用備援資料" : reserveLabel}
          </span>
        </div>
      </div>
      <article className="hero-stat gauge-card">
        <div className="card-label"><CircleGauge size={17} /> 系統供電利用率 <Info size={14} /></div>
        <CircularGauge value={utilization} />
        <div className="gauge-values">
          <span>目前用電 <strong>{formatNumber(current)} MW</strong></span>
          <span>供電能力 <strong>{formatNumber(power.forecast_max_supply_mw)} MW</strong></span>
        </div>
      </article>
      <article className="hero-stat peak-card">
        <div className="peak-icon"><Mountain size={22} /></div>
        <div className="card-label">今日預估尖峰</div>
        <strong className="peak-number">{formatNumber(power.forecast_peak_demand_mw)} <small>MW</small></strong>
        <span className="peak-time">{power.forecast_peak_hour_range ?? "—"}</span>
        <div className="peak-divider" />
        <dl>
          <div><dt>備轉容量率</dt><dd>{formatNumber(reserveRate, 1)}%</dd></div>
          <div><dt>備轉容量</dt><dd>{formatNumber(power.forecast_peak_reserve_mw)} MW</dd></div>
        </dl>
        <span className="peak-status"><Sun size={15} /> 尖峰時段 {reserveLabel}</span>
      </article>
    </section>
  );
}

function LoadChart({
  data,
  cursorTime,
  onCursorChange,
  mode,
}: {
  data: AreaLoad[];
  cursorTime: string | null;
  onCursorChange: (time: string) => void;
  mode: LoadMode;
}) {
  const selected = nearestByTime(data, cursorTime) ?? data[data.length - 1];
  const maxValue = useMemo(() => {
    const raw = Math.max(...data.map((point) => point.total_load_mw), 45000);
    return Math.ceil(raw / 10000) * 10000;
  }, [data]);
  const cursorX = selected ? 54 + (timeMinutes(selected.observed_at) / 1440) * 688 : 54;
  const cursorY = selected ? 20 + (1 - selected.total_load_mw / maxValue) * 237 : 257;
  const tooltipX = Math.min(Math.max(cursorX - 102, 54), 522);

  const updateFromPointer = (event: PointerEvent<SVGRectElement>) => {
    if (!data.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const target = ratio * 1440;
    const nearest = data.reduce((closest, point) =>
      Math.abs(timeMinutes(point.observed_at) - target) <
      Math.abs(timeMinutes(closest.observed_at) - target)
        ? point
        : closest,
    );
    onCursorChange(nearest.observed_at);
  };

  const updateFromKeyboard = (event: KeyboardEvent<SVGRectElement>) => {
    if (!selected || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = data.findIndex((point) => point.observed_at === selected.observed_at);
    let nextIndex = currentIndex;
    if (event.key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
    if (event.key === "ArrowRight") nextIndex = Math.min(data.length - 1, currentIndex + 1);
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = data.length - 1;
    onCursorChange(data[nextIndex].observed_at);
  };

  return (
    <div className="load-chart-shell">
      <svg className="load-chart" viewBox="0 0 760 292" role="img" aria-label="今日用電曲線圖">
        <defs>
          <linearGradient id="loadArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2b7ee9" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#2b7ee9" stopOpacity="0.015" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = 20 + ratio * 237;
          const value = maxValue * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1="54" x2="742" y1={y} y2={y} className="chart-grid" />
              <text x="45" y={y + 4} textAnchor="end" className="chart-axis-label">
                {formatNumber(value / 1000)}k
              </text>
            </g>
          );
        })}
        {[0, 4, 8, 12, 16, 20, 24].map((hour) => {
          const x = 54 + (hour / 24) * 688;
          return (
            <text key={hour} x={x} y="281" textAnchor={hour === 0 ? "start" : hour === 24 ? "end" : "middle"} className="chart-axis-label">
              {String(hour).padStart(2, "0")}:00
            </text>
          );
        })}
        {mode === "total" ? (
          <>
            <path d={areaPath(data, maxValue)} fill="url(#loadArea)" />
            <path d={linePath(data, (point) => point.total_load_mw, maxValue)} className="chart-line total" />
          </>
        ) : (
          <>
            <path d={linePath(data, (point) => point.north_load_mw, maxValue)} className="chart-line north" />
            <path d={linePath(data, (point) => point.central_load_mw, maxValue)} className="chart-line central" />
            <path d={linePath(data, (point) => point.south_load_mw, maxValue)} className="chart-line south" />
            <path d={linePath(data, (point) => point.east_load_mw, maxValue)} className="chart-line east" />
          </>
        )}
        {selected && (
          <g className="chart-cursor" pointerEvents="none">
            <line x1={cursorX} x2={cursorX} y1="20" y2="257" />
            <circle cx={cursorX} cy={cursorY} r="6" />
            <g transform={`translate(${tooltipX} 28)`}>
              <rect width="220" height={mode === "total" ? 102 : 160} rx="14" />
              <text x="16" y="25" className="tooltip-time">{formatTime(selected.observed_at)}</text>
              <circle cx="19" cy="52" r="5" className="dot-total" />
              <text x="33" y="57" className="tooltip-label">總用電</text>
              <text x="204" y="57" textAnchor="end" className="tooltip-value">{formatNumber(selected.total_load_mw)} MW</text>
              {mode === "regions" && (
                <>
                  <text x="16" y="88" className="tooltip-sub">北部 {formatNumber(selected.north_load_mw)}</text>
                  <text x="116" y="88" className="tooltip-sub">中部 {formatNumber(selected.central_load_mw)}</text>
                  <text x="16" y="116" className="tooltip-sub">南部 {formatNumber(selected.south_load_mw)}</text>
                  <text x="116" y="116" className="tooltip-sub">東部 {formatNumber(selected.east_load_mw)}</text>
                  <text x="16" y="144" className="tooltip-note">單位：MW</text>
                </>
              )}
              {mode === "total" && <text x="16" y="84" className="tooltip-note">拖曳或使用方向鍵探索</text>}
            </g>
          </g>
        )}
        <rect
          x="54"
          y="20"
          width="688"
          height="237"
          fill="transparent"
          className="chart-hit-area"
          onPointerMove={updateFromPointer}
          onPointerDown={updateFromPointer}
          onKeyDown={updateFromKeyboard}
          tabIndex={0}
          role="slider"
          aria-label="探索用電曲線時間"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, data.length - 1)}
          aria-valuenow={Math.max(0, data.indexOf(selected))}
          aria-valuetext={selected ? `${formatTime(selected.observed_at)}，總用電 ${formatNumber(selected.total_load_mw)} MW` : "無資料"}
        />
      </svg>
    </div>
  );
}

function FuelMixCard({
  mix,
  history,
}: {
  mix: FuelMix;
  history: FuelMix[];
}) {
  const [focusedFuel, setFocusedFuel] = useState<string | null>(null);
  const values = fuelDefinitions.map((fuel) => ({ ...fuel, value: Math.max(0, fuel.getValue(mix)) }));
  const total = values.reduce((sum, fuel) => sum + fuel.value, 0) || 1;
  let cursor = 0;
  const gradient = values
    .map((fuel) => {
      const start = cursor;
      const end = cursor + (fuel.value / total) * 100;
      cursor = end;
      const color = focusedFuel && focusedFuel !== fuel.key ? "var(--muted-ring)" : fuel.color;
      return `${color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    })
    .join(", ");
  const focused = values.find((fuel) => fuel.key === focusedFuel) ?? null;
  const trendFuel = focused ?? values.find((fuel) => fuel.key === "solar")!;
  const trendValues = history.map((record) => trendFuel.getValue(record));

  return (
    <article className="panel mix-card" id="mix">
      <div className="panel-heading">
        <div>
          <span className="section-kicker"><Leaf size={15} /> 即時發電</span>
          <h2>能源從哪裡來？</h2>
        </div>
        <span className="panel-total">總計 {formatNumber(mix.total_mw)} MW</span>
      </div>
      <div className="mix-content">
        <button
          className="donut-wrap"
          type="button"
          onClick={() => setFocusedFuel(null)}
          aria-label={focused ? `目前聚焦${focused.label}，按下顯示全部能源` : "即時發電結構"}
        >
          <span className="donut" style={{ background: `conic-gradient(${gradient})` }}>
            <span className="donut-hole">
              {focused ? (
                <>
                  <strong>{((focused.value / total) * 100).toFixed(1)}%</strong>
                  <span>{focused.label}</span>
                </>
              ) : (
                <>
                  <strong>{formatNumber(mix.total_mw)}</strong>
                  <span>MW</span>
                </>
              )}
            </span>
          </span>
        </button>
        <div className="fuel-list" role="list" aria-label="能源別發電量，可點選聚焦">
          {values.map((fuel) => {
            const Icon = fuel.icon;
            const isFocused = focusedFuel === fuel.key;
            return (
              <button
                key={fuel.key}
                className={`fuel-row ${isFocused ? "is-focused" : ""} ${focusedFuel && !isFocused ? "is-muted" : ""}`}
                type="button"
                onClick={() => setFocusedFuel(isFocused ? null : fuel.key)}
                aria-pressed={isFocused}
              >
                <span className="fuel-icon" style={{ color: fuel.color }}><Icon size={16} /></span>
                <span>{fuel.label}</span>
                <strong>{formatNumber(fuel.value)} MW</strong>
                <small>{((fuel.value / total) * 100).toFixed(1)}%</small>
              </button>
            );
          })}
        </div>
      </div>
      <div className="fuel-trend">
        <div>
          <span style={{ color: trendFuel.color }}>{trendFuel.label}今日曲線</span>
          <strong>{formatNumber(trendFuel.value)} MW</strong>
        </div>
        <svg viewBox="0 0 246 72" role="img" aria-label={`${trendFuel.label}今日發電曲線`}>
          <path d={miniLinePath(trendValues)} style={{ stroke: trendFuel.color }} />
        </svg>
      </div>
    </article>
  );
}

function pointsFromGeometry(geometry: Geometry): Position[] {
  if (geometry.type === "Polygon") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
}

function projectPoint(position: Position): [number, number] {
  const [longitude, latitude] = position;
  return [38 + (longitude - 120) * 118, 420 - (latitude - 21.75) * 106];
}

function ringPath(ring: Position[]) {
  return ring
    .map((position, index) => {
      const [x, y] = projectPoint(position);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ") + " Z";
}

function geometryPath(geometry: Geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates.map(ringPath).join(" ");
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) => polygon.map(ringPath)).join(" ");
  }
  return "";
}

function isMainIslandFeature(feature: Feature<Geometry>) {
  const points = pointsFromGeometry(feature.geometry);
  if (!points.length) return false;
  const longitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  return longitude > 119.7 && longitude < 122.3;
}

function TaiwanMap({
  regions,
  selectedRegion,
  onSelectRegion,
}: {
  regions: RegionDefinition[];
  selectedRegion: RegionKey;
  onSelectRegion: (region: RegionKey) => void;
}) {
  const [features, setFeatures] = useState<Array<Feature<Geometry>>>([]);
  const selected = regions.find((region) => region.key === selectedRegion)!;

  useEffect(() => {
    let active = true;
    fetch("/taiwan-counties.topo.json")
      .then((response) => response.json() as Promise<Topology<{ layer1: GeometryCollection }>>)
      .then((topology) => {
        const result = topoFeature(topology, topology.objects.layer1) as FeatureCollection<Geometry>;
        if (active) setFeatures(result.features.filter(isMainIslandFeature));
      })
      .catch(() => setFeatures([]));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="map-stage">
      <svg className="taiwan-map" viewBox="0 0 330 450" role="img" aria-label="台灣四區電力供需地圖">
        <defs>
          <filter id="mapShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="7" stdDeviation="8" floodColor="#315c54" floodOpacity="0.2" />
          </filter>
          <marker id="flowArrowGreen" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 Z" fill="#36a96f" />
          </marker>
          <marker id="flowArrowOrange" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 Z" fill="#ef8b2c" />
          </marker>
          <marker id="flowArrowViolet" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 Z" fill="#8373d5" />
          </marker>
        </defs>
        <g filter="url(#mapShadow)">
          {features.map((county, index) => {
            const countyName = String(county.properties?.COUNTYNAME ?? county.properties?.name ?? "");
            const region = countyRegions[countyName];
            if (!region) return null;
            return (
              <path
                key={`${countyName}-${index}`}
                d={geometryPath(county.geometry)}
                className={`county-shape region-${region} ${selectedRegion === region ? "is-active" : ""}`}
                fillRule="evenodd"
                onPointerEnter={() => onSelectRegion(region)}
                onFocus={() => onSelectRegion(region)}
                onClick={() => onSelectRegion(region)}
                tabIndex={0}
                role="button"
                aria-label={`${countyName}，${regionMeta[region].label}`}
              />
            );
          })}
        </g>
        <path className="flow-path flow-orange" d="M106 367 C76 320 84 276 118 249" markerEnd="url(#flowArrowOrange)" />
        <path className="flow-path flow-green" d="M128 228 C102 177 118 128 157 89" markerEnd="url(#flowArrowGreen)" />
        <path className="flow-path flow-violet" d="M177 213 C222 190 250 201 264 229" markerEnd="url(#flowArrowViolet)" />
        <g className="map-label north-label"><text x="174" y="75">北部</text></g>
        <g className="map-label central-label"><text x="130" y="216">中部</text></g>
        <g className="map-label south-label"><text x="110" y="337">南部</text></g>
        <g className="map-label east-label"><text x="225" y="242">東部</text></g>
      </svg>
      <div className="map-tooltip" style={{ "--region-color": selected.color } as CSSProperties}>
        <span>{selected.label}</span>
        <dl>
          <div><dt>發電</dt><dd>{formatNumber(selected.generation)} MW</dd></div>
          <div><dt>用電</dt><dd>{formatNumber(selected.load)} MW</dd></div>
          <div><dt>差額</dt><dd className={selected.difference >= 0 ? "positive" : "negative"}>{selected.difference >= 0 ? "+" : ""}{formatNumber(selected.difference)} MW</dd></div>
        </dl>
      </div>
    </div>
  );
}

function RegionCard({ area }: { area: AreaSnapshot }) {
  const [selectedRegion, setSelectedRegion] = useState<RegionKey>("central");
  const regions = useMemo<RegionDefinition[]>(
    () =>
      (Object.keys(regionMeta) as RegionKey[]).map((key) => {
        const generation = area[`${key}_generation_mw` as keyof AreaSnapshot] as number;
        const load = area[`${key}_load_mw` as keyof AreaSnapshot] as number;
        return {
          key,
          label: regionMeta[key].label,
          color: regionMeta[key].color,
          generation,
          load,
          difference: generation - load,
        };
      }),
    [area],
  );

  return (
    <article className="panel region-card" id="regions">
      <div className="panel-heading region-heading">
        <div>
          <span className="section-kicker"><Bolt size={15} /> 島嶼供需</span>
          <h2>區域電力供需</h2>
        </div>
        <span className="estimate-badge"><Info size={13} /> 推估電力流向</span>
      </div>
      <div className="region-content">
        <TaiwanMap regions={regions} selectedRegion={selectedRegion} onSelectRegion={setSelectedRegion} />
        <div className="region-list" role="list" aria-label="各區域發電與用電">
          {regions.map((region) => {
            const selected = selectedRegion === region.key;
            return (
              <button
                key={region.key}
                type="button"
                className={`region-row ${selected ? "is-selected" : ""}`}
                style={{ "--region-color": region.color } as CSSProperties}
                onPointerEnter={() => setSelectedRegion(region.key)}
                onFocus={() => setSelectedRegion(region.key)}
                onClick={() => setSelectedRegion(region.key)}
                aria-pressed={selected}
              >
                <span className="region-name"><span className="region-symbol"><Zap size={15} /></span>{region.label}</span>
                <span><small>發電</small><strong>{formatNumber(region.generation)}</strong><em>MW</em></span>
                <span><small>用電</small><strong>{formatNumber(region.load)}</strong><em>MW</em></span>
                <span className={region.difference >= 0 ? "positive" : "negative"}>
                  <small>差額</small><strong>{region.difference >= 0 ? "+" : ""}{formatNumber(region.difference)}</strong><em>MW</em>
                </span>
                <span className="flow-state">{region.difference >= 0 ? "淨輸出" : "淨輸入"}<ChevronRight size={15} /></span>
              </button>
            );
          })}
          <div className="flow-legend">
            <span><i className="legend-line south" /> 南部 → 中部</span>
            <span><i className="legend-line central" /> 中部 → 北部</span>
            <span><i className="legend-line east" /> 中部 → 東部</span>
          </div>
          <p className="region-note"><Info size={13} /> 流向依各區發電與用電差額推估，並非台電即時潮流量。</p>
        </div>
      </div>
    </article>
  );
}

function SolarInsight({ history, current }: { history: FuelMix[]; current: FuelMix }) {
  const solarValues = history.map((mix) => mix.solar_mw);
  const peak = history.reduce((best, item) => (item.solar_mw > best.solar_mw ? item : best), current);
  const accumulatedGwh = history.reduce((sum, item, index) => {
    if (index === 0) return sum;
    const previous = history[index - 1];
    const hours = (new Date(item.observed_at).getTime() - new Date(previous.observed_at).getTime()) / 3600000;
    return sum + ((previous.solar_mw + item.solar_mw) / 2) * Math.max(0, Math.min(hours, 0.5));
  }, 0) / 1000;
  const share = current.total_mw > 0 ? (current.solar_mw / current.total_mw) * 100 : 0;

  return (
    <article className="panel solar-card">
      <div className="solar-card-heading">
        <span className="sun-badge"><Sun size={21} /></span>
        <div><span>太陽能即時發電</span><strong>{formatNumber(current.solar_mw)} <small>MW</small></strong></div>
      </div>
      <span className="solar-share">占目前用電 <strong>{share.toFixed(1)}%</strong></span>
      <svg className="solar-spark" viewBox="0 0 246 72" role="img" aria-label="今日太陽能發電曲線">
        <defs>
          <linearGradient id="solarArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f5b900" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#f5b900" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${miniLinePath(solarValues)} L246,72 L0,72 Z`} fill="url(#solarArea)" />
        <path d={miniLinePath(solarValues)} />
      </svg>
      <dl className="solar-stats">
        <div><dt>今日累積</dt><dd>{accumulatedGwh.toFixed(1)} GWh</dd></div>
        <div><dt>今日最高</dt><dd>{formatNumber(peak.solar_mw)} MW</dd></div>
        <div><dt>高峰時間</dt><dd>{formatTime(peak.observed_at)}</dd></div>
      </dl>
    </article>
  );
}

function GeneratorSection({ generators }: { generators: GeneratorRecord[] }) {
  const units = useMemo(() => generators.filter((record) => !record.is_summary), [generators]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<GeneratorFilter>("all");
  const [visibleCount, setVisibleCount] = useState(12);
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return units
      .filter((unit) => {
        if (normalized && !`${unit.unit_name} ${unit.category}`.toLowerCase().includes(normalized)) return false;
        const generation = unit.net_generation_mw ?? 0;
        if (filter === "running") return generation > 0;
        if (filter === "stopped") return generation <= 0;
        if (filter === "limited") return Boolean(unit.status);
        return true;
      })
      .sort((a, b) => (b.net_generation_mw ?? 0) - (a.net_generation_mw ?? 0));
  }, [filter, query, units]);

  const runningCount = units.filter((unit) => (unit.net_generation_mw ?? 0) > 0).length;
  const limitedCount = units.filter((unit) => unit.status).length;
  const totalGeneration = units.reduce((sum, unit) => sum + Math.max(0, unit.net_generation_mw ?? 0), 0);
  const displayed = filtered.slice(0, visibleCount);

  return (
    <section className="panel generator-section" id="generators" aria-labelledby="generator-title">
      <div className="generator-heading">
        <div>
          <span className="section-kicker"><Factory size={15} /> 機組透明度</span>
          <h2 id="generator-title">發電機組即時狀態</h2>
          <p>展開任一機組，查看裝置容量、發電量與運轉限制。</p>
        </div>
        <div className="generator-summary" aria-label="機組狀態摘要">
          <span><strong>{units.length}</strong> 個機組</span>
          <span className="summary-running"><strong>{runningCount}</strong> 發電中</span>
          <span className="summary-limited"><strong>{limitedCount}</strong> 有註記</span>
          <span><strong>{formatNumber(totalGeneration)}</strong> MW</span>
        </div>
      </div>
      <div className="generator-toolbar">
        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">搜尋機組</span>
          <input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(12); }} placeholder="搜尋電廠或機組名稱" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="清除搜尋"><X size={15} /></button>}
        </label>
        <div className="filter-tabs" role="group" aria-label="篩選機組狀態">
          {([
            ["all", "全部"],
            ["running", "發電中"],
            ["stopped", "未發電"],
            ["limited", "有註記"],
          ] as Array<[GeneratorFilter, string]>).map(([value, label]) => (
            <button key={value} type="button" onClick={() => { setFilter(value); setVisibleCount(12); }} className={`filter-${value} ${filter === value ? "is-active" : ""}`} aria-pressed={filter === value}>{label}</button>
          ))}
        </div>
      </div>
      <div className="generator-status-legend" aria-label="機組狀態顏色說明">
        <span className="unit-status is-running">發電中</span>
        <span className="unit-status is-limited">有註記</span>
        <span className="unit-status is-outage">停機／檢修</span>
        <span className="unit-status is-stopped">未發電</span>
      </div>
      <div className="generator-table-wrap">
        <table className="generator-table">
          <thead>
            <tr><th>機組名稱</th><th>能源別</th><th>淨發電量</th><th>裝置容量</th><th>利用率</th><th>狀態</th><th><span className="sr-only">展開</span></th></tr>
          </thead>
          <tbody>
            {displayed.map((unit) => {
              const isExpanded = expanded === unit.id;
              const generation = unit.net_generation_mw ?? 0;
              const utilization = unit.utilization_percent ?? (unit.installed_capacity_mw ? (generation / unit.installed_capacity_mw) * 100 : 0);
              const displayStatus = getGeneratorDisplayStatus(unit);
              return (
                <tr key={unit.id} className={isExpanded ? "is-expanded" : ""}>
                  <td colSpan={7}>
                    <button className="generator-row-button" type="button" onClick={() => setExpanded(isExpanded ? null : unit.id)} aria-expanded={isExpanded}>
                      <span className="unit-name"><span className={`source-dot source-${unit.category_code}`} />{unit.unit_name}</span>
                      <span className="unit-category" data-label="能源別">{unit.category.replace(/\(.+\)/, "")}</span>
                      <span className="unit-number" data-label="淨發電量"><strong>{formatNumber(generation, 1)}</strong> MW</span>
                      <span className="unit-number" data-label="裝置容量">{formatNumber(unit.installed_capacity_mw, 1)} MW</span>
                      <span className="utilization-cell" data-label="利用率"><span><i style={{ width: `${Math.min(100, Math.max(0, utilization))}%` }} /></span><strong>{formatNumber(utilization, 1)}%</strong></span>
                      <span data-label="狀態"><span className={`unit-status ${displayStatus.tone}`} aria-label={`${displayStatus.description}：${displayStatus.label}`}>{displayStatus.label}</span></span>
                      <ChevronDown size={17} className="row-chevron" />
                    </button>
                    {isExpanded && (
                      <div className="unit-detail">
                        <span><Gauge size={16} /> 即時出力 {formatNumber(generation, 1)} MW</span>
                        <span><BatteryCharging size={16} /> 裝置容量 {formatNumber(unit.installed_capacity_mw, 1)} MW</span>
                        <span><Info size={16} /> {unit.status ? `台電註記：${unit.status}` : "目前無運轉限制註記"}</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!displayed.length && <div className="empty-generators"><Search size={22} /><p>找不到符合條件的機組</p></div>}
      </div>
      {filtered.length > visibleCount && (
        <button className="load-more" type="button" onClick={() => setVisibleCount((count) => count + 20)}>
          顯示更多機組 <ChevronDown size={16} />
        </button>
      )}
    </section>
  );
}

function Footer({ updatedAt }: { updatedAt: string }) {
  return (
    <footer className="site-footer">
      <div className="footer-brand"><PowerMark size={34} /><div><strong>台灣電力</strong><small>資料更新 {formatDateTime(updatedAt)}</small></div></div>
      <p>資料每 10 分鐘更新；區域數值與流向為推估，實際資訊以台電公司正式公布為準。</p>
      <nav aria-label="資料來源">
        <a href="https://opendata.futa.gg/swagger-ui" target="_blank" rel="noreferrer">開放資料 API <ExternalLink size={13} /></a>
        <a href="https://www.taipower.com.tw/2289/2363/2367/2368/10262/normalPost" target="_blank" rel="noreferrer">台電資料來源 <ExternalLink size={13} /></a>
      </nav>
    </footer>
  );
}

export function PowerDashboard() {
  const [data, setData] = useState<DashboardData>(fallbackData);
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [curveOffset, setCurveOffset] = useState(0);
  const [loadMode, setLoadMode] = useState<LoadMode>("total");
  const [cursorTime, setCursorTime] = useState<string | null>(fallbackData.areaLoads.at(-1)?.observed_at ?? null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  const refresh = useCallback(async (offset = curveOffset, quiet = false) => {
    if (!quiet) setIsRefreshing(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const requestedDate = dateKey(offset);
    try {
      const [power, fuelMix, areaLoads, areaSnapshot, generators] = await Promise.all([
        getJson<PowerSnapshot>("/taipower/power-snapshots/latest", controller.signal),
        getJson<FuelMix[]>(`/taipower/fuel-mix?date=${requestedDate}&limit=500`, controller.signal),
        getJson<AreaLoad[]>(`/taipower/area-loads?date=${requestedDate}&limit=500`, controller.signal),
        getJson<AreaSnapshot>("/taipower/area-snapshots/latest", controller.signal),
        getJson<GeneratorRecord[]>("/taipower/generators/latest", controller.signal),
      ]);
      if (!fuelMix.length || !areaLoads.length) throw new Error("No curve data");
      setData({ power, fuelMix, areaLoads, areaSnapshot, generators });
      setCursorTime(areaLoads[areaLoads.length - 1].observed_at);
      setConnection("live");
    } catch {
      setConnection("offline");
    } finally {
      window.clearTimeout(timeout);
      setIsRefreshing(false);
    }
  }, [curveOffset]);

  useEffect(() => {
    void refresh(curveOffset, true);
  }, [curveOffset, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(curveOffset, true), 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [curveOffset, refresh]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try { localStorage.setItem("power-theme", next); } catch {}
  };

  const currentMix = nearestByTime(data.fuelMix, cursorTime) ?? data.fuelMix[data.fuelMix.length - 1];
  const solarShare = currentMix.total_mw > 0 ? (currentMix.solar_mw / currentMix.total_mw) * 100 : 0;

  return (
    <div className="power-app" id="top">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <Header
        connection={connection}
        updatedAt={data.power.published_at}
        isRefreshing={isRefreshing}
        onRefresh={() => void refresh(curveOffset)}
        theme={theme}
        onThemeToggle={toggleTheme}
      />
      <main className="site-main">
        {connection === "offline" && (
          <div className="offline-banner" role="status">
            <Info size={16} /> 即時資料暫時無法連線，畫面目前使用最後一筆備援資料。
            <button type="button" onClick={() => void refresh(curveOffset)}>重新連線</button>
          </div>
        )}
        <Hero power={data.power} connection={connection} />
        <section className="dashboard-grid" aria-label="即時電力圖表">
          <article className="panel load-card">
            <div className="panel-heading load-heading">
              <div>
                <span className="section-kicker"><Bolt size={15} /> 24 小時脈動</span>
                <h2>{curveOffset === 0 ? "今日" : "昨日"}用電曲線</h2>
                <p>移動游標，能源組成會同步到相同時間。</p>
              </div>
              <div className="chart-controls">
                <div className="segmented-control" role="group" aria-label="選擇日期">
                  <button className={curveOffset === 0 ? "is-active" : ""} type="button" onClick={() => setCurveOffset(0)}>今日</button>
                  <button className={curveOffset === -1 ? "is-active" : ""} type="button" onClick={() => setCurveOffset(-1)}>昨日</button>
                </div>
                <div className="segmented-control subtle" role="group" aria-label="選擇曲線分類">
                  <button className={loadMode === "total" ? "is-active" : ""} type="button" onClick={() => setLoadMode("total")}>總用電</button>
                  <button className={loadMode === "regions" ? "is-active" : ""} type="button" onClick={() => setLoadMode("regions")}>各區</button>
                </div>
              </div>
            </div>
            <div className="chart-legend">
              {loadMode === "total" ? <span><i className="legend-dot total" /> 實際用電</span> : (
                <>
                  {(Object.keys(regionMeta) as RegionKey[]).map((key) => <span key={key}><i className={`legend-dot ${key}`} /> {regionMeta[key].label}</span>)}
                </>
              )}
              <span className="chart-unit">單位：MW</span>
            </div>
            <LoadChart data={data.areaLoads} cursorTime={cursorTime} onCursorChange={setCursorTime} mode={loadMode} />
          </article>
          <FuelMixCard mix={currentMix} history={data.fuelMix} />
        </section>
        <section className="region-grid" aria-label="區域電力與太陽能洞察">
          <RegionCard area={data.areaSnapshot} />
          <SolarInsight history={data.fuelMix} current={currentMix} />
        </section>
        <aside className="insight-strip">
          <span className="insight-icon"><Sun size={28} /></span>
          <div><small>即時洞察</small><strong>太陽能正供應全台 <em>{solarShare.toFixed(1)}%</em> 用電</strong></div>
          <span className="insight-divider" />
          <div className="insight-stat"><ArrowUpRight size={18} /><span>即時發電<strong>{formatNumber(currentMix.solar_mw)} MW</strong></span></div>
          <span className="insight-divider" />
          <div className="insight-stat"><Leaf size={18} /><span>再生能源<strong>{formatNumber(currentMix.solar_mw + currentMix.wind_mw + currentMix.hydro_mw + currentMix.other_renewable_mw)} MW</strong></span></div>
          <a href="#mix">探索能源組成 <ArrowRight size={15} /></a>
        </aside>
        <GeneratorSection generators={data.generators} />
      </main>
      <Footer updatedAt={data.power.published_at} />
      {connection === "loading" && (
        <div className="loading-toast" role="status"><LoaderCircle size={17} className="is-spinning" /> 正在連接即時電力資料</div>
      )}
    </div>
  );
}
