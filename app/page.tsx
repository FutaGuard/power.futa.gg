import type { Metadata } from "next";
import { PowerDashboard } from "./PowerDashboard";

export const metadata: Metadata = {
  title: "台灣電力即時資訊 · power.futa.gg",
  description:
    "一次掌握台灣即時用電、發電結構、區域供需、備轉容量與各機組發電狀態。",
};

export default function Home() {
  return <PowerDashboard />;
}
