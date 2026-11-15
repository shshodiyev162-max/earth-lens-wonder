import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LayerDateState } from "@/hooks/useLayerDate";
import { getLayer, type GibsLayer } from "@/lib/gibs/catalog";
import DateControl from "../DateControl";

const layer = (id: string) => getLayer(id) as GibsLayer;

function state(date: string, earliest: string, latest: string): LayerDateState {
  return { date, resolution: "exact", domain: null, latest, earliest, defaultDate: latest, loading: false, error: false, waiting: false };
}

describe("DateControl", () => {
  it("picks a monthly layer's date by month, with a slider through its whole record", () => {
    const onChange = vi.fn();
    render(<DateControl layer={layer("MERRA2_2m_Air_Temperature_Assimilated_Monthly")} state={state("2026-08-01", "2025-01-01", "2026-08-01")} requested={null} onChange={onChange} />);
    const month = screen.getByLabelText(/\(month\)/);
    expect(month).toHaveAttribute("type", "month");
    expect(month).toHaveValue("2026-08");
    fireEvent.change(month, { target: { value: "2025-07" } });
    expect(onChange).toHaveBeenLastCalledWith("2025-07-01");

    const slider = screen.getByRole("slider", { name: /Scrub through time/ });
    expect(slider).toHaveAttribute("max", "19");
    expect(slider).toHaveAttribute("aria-valuetext", "Aug 2026");
    fireEvent.change(slider, { target: { value: "3" } });
    // The map follows once the handle is let go, not at every month passed.
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(slider);
    expect(onChange).toHaveBeenLastCalledWith("2025-04-01");
  });

  it("goes back to following the latest month when slid to the far end", () => {
    const onChange = vi.fn();
    render(<DateControl layer={layer("MERRA2_2m_Air_Temperature_Assimilated_Monthly")} state={state("2025-04-01", "2025-01-01", "2026-08-01")} requested="2025-04-01" onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: /Scrub through time/ });
    expect(slider).toHaveValue("3");
    fireEvent.change(slider, { target: { value: "19" } });
    fireEvent.keyUp(slider, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("picks a yearly layer's date by year", () => {
    const onChange = vi.fn();
    render(<DateControl layer={layer("MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual")} state={state("2024-01-01", "2001-01-01", "2024-01-01")} requested={null} onChange={onChange} />);
    const year = screen.getByLabelText(/\(year\)/);
    expect(year.tagName).toBe("SELECT");
    fireEvent.change(year, { target: { value: "2010" } });
    expect(onChange).toHaveBeenLastCalledWith("2010-01-01");
  });

  it("keeps a day picker for daily layers, without a slider", () => {
    render(<DateControl layer={layer("MODIS_Terra_CorrectedReflectance_TrueColor")} state={state("2026-11-10", "2000-02-24", "2026-11-12")} requested={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Observation date for/)).toHaveAttribute("type", "date");
    expect(screen.queryByRole("slider")).toBeNull();
  });
});
