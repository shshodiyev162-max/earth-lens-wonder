import { useId, useSyncExternalStore } from "react";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { formatUtc, type DayNightMode, type HourStore } from "./sun";

const MODES: { value: DayNightMode; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "custom", label: "Custom" },
  { value: "auto", label: "Auto" },
];

interface DayNightControlProps {
  mode: DayNightMode;
  onModeChange: (mode: DayNightMode) => void;
  customHour: number;
  onCustomHourChange: (hour: number) => void;
  hourStore: HourStore;
}

/** Glass pill under the hero: show the real time now, pick a time, or let days pass slowly. */
export default function DayNightControl({ mode, onModeChange, customHour, onCustomHourChange, hourStore }: DayNightControlProps) {
  const sliderId = useId();
  const shownHour = useSyncExternalStore(hourStore.subscribe, hourStore.get);
  const customMinutes = Math.round(customHour * 60);

  const custom = mode === "custom";

  // One glass pill. With Custom, the time slider sits between the modes and the clock;
  // on phones it opens on its own line underneath, so the buttons stay where they were tapped.
  return (
    <div
      className={`pointer-events-auto glass flex flex-wrap items-center justify-center gap-1 p-1 text-xs sm:flex-nowrap ${
        custom ? "rounded-2xl sm:rounded-full" : "rounded-full"
      }`}
    >
      <span aria-hidden="true" className="hidden pl-3 pr-1 text-muted-foreground sm:inline">
        Day and night
      </span>
      <RadioGroup.Root
        aria-label="Day and night"
        value={mode}
        onValueChange={(value) => onModeChange(value as DayNightMode)}
        orientation="horizontal"
        className="flex items-center gap-1"
      >
        {MODES.map((item) => (
          <RadioGroup.Item
            key={item.value}
            value={item.value}
            className="rounded-full px-3 py-2 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 data-[state=checked]:bg-primary/15 data-[state=checked]:text-primary"
          >
            {item.label}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      <span className="min-w-[5.5rem] pl-1 pr-3 text-center tabular-nums text-muted-foreground sm:order-last">{formatUtc(shownHour)}</span>
      {custom && (
        <div className="flex basis-full items-center justify-center gap-2 px-3 pb-1 sm:basis-auto sm:px-2 sm:pb-0">
          <label htmlFor={sliderId} className="text-muted-foreground">
            Time
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={24 * 60 - 5}
            step={5}
            value={customMinutes}
            aria-valuetext={formatUtc(customHour)}
            onChange={(event) => onCustomHourChange(Number(event.target.value) / 60)}
            className="h-6 w-full max-w-60 cursor-pointer accent-primary sm:w-40"
          />
        </div>
      )}
    </div>
  );
}
