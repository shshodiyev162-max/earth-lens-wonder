import { Image as ImageIcon, Ruler, TrendingUp, type LucideIcon } from "lucide-react";
import { kindLabel } from "@/lib/geo/geocode";
import { isScienceLayer } from "@/lib/gibs/catalog";
import { describeQuestion } from "@/lib/trends/query";
import { KIND_ICON } from "./placeIcons";
import type { SearchItem } from "./useUniversalSearch";

export interface SearchItemView {
  key: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  /** Section heading shown above the first item of each kind. */
  section: string;
}

/** How one search result is shown (shared by the top search bar and the Ctrl/⌘K window). */
export function searchItemView(item: SearchItem): SearchItemView {
  if (item.type === "trend") {
    return { key: "trend", icon: TrendingUp, title: `Find where: ${describeQuestion(item.parsed)}`, subtitle: "Trend detective · scans NASA monthly maps for hotspots", section: "Your question" };
  }
  if (item.type === "place") {
    return { key: item.place.id, icon: KIND_ICON[item.place.kind], title: item.place.name, subtitle: `${kindLabel(item.place.kind)}${item.place.context ? ` · ${item.place.context}` : ""}`, section: "Places" };
  }
  return { key: item.layer.id, icon: isScienceLayer(item.layer) ? Ruler : ImageIcon, title: item.layer.name, subtitle: item.layer.source, section: "NASA layers" };
}

/** True when the item starts a new section (its kind differs from the one before). */
export function startsSection(items: SearchItem[], index: number): boolean {
  return index === 0 || items[index - 1].type !== items[index].type;
}
