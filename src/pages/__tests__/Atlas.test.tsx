import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { atlasMeasure, hotspotName } from "@/lib/atlas/atlas";
import Atlas from "../Atlas";

// The map needs a real browser: this test is about the panel beside it.
vi.mock("@/components/map/BaseMap", () => ({ default: () => <div data-testid="map" /> }));

function Address() {
  const location = useLocation();
  return <output data-testid="address">{location.pathname + location.search}</output>;
}

function show(address: string) {
  return render(
    <MemoryRouter initialEntries={[address]}>
      <Routes>
        <Route path="*" element={<><Atlas /><Address /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("the Atlas page", () => {
  it("opens on vegetation with its whole-map answer and where it changed most", () => {
    show("/atlas");
    const measure = atlasMeasure("vegetation");
    expect(screen.getByRole("heading", { level: 2, name: `Vegetation, ${measure.startYear}–${measure.endYear}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vegetation" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/The whole map:/)).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Biggest changes, largest first" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(measure.hotspots.length);
    expect(within(list).getByText(hotspotName(measure.hotspots[0]))).toBeInTheDocument();
  });

  it("switches measure and keeps it in the address", () => {
    show("/atlas");
    fireEvent.click(screen.getByRole("button", { name: "Sea temperature" }));
    expect(screen.getByTestId("address")).toHaveTextContent("/atlas?m=sst");
    expect(screen.getByRole("heading", { level: 2, name: /^Sea temperature, / })).toBeInTheDocument();
  });

  it("offers a closer look at a change on the Trends page", () => {
    show("/atlas?m=heat");
    const measure = atlasMeasure("heat");
    expect(screen.queryByRole("link", { name: /Look closer/ })).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Biggest changes, largest first" });
    fireEvent.click(within(list).getAllByRole("button")[0]);
    const link = screen.getByRole("link", { name: /Look closer on the Trends page/ });
    expect(link.getAttribute("href")).toMatch(/^\/trends\?ind=heat&dir=(decline|increase)&poly=/);
    expect(link.getAttribute("href")).toContain(`t=since-${measure.startYear}`);
  });

  it("says how it was measured, and what NASA was missing", () => {
    show("/atlas?m=sst");
    const measure = atlasMeasure("sst");
    expect(screen.getByText(new RegExp(`${measure.mapsRead} monthly NASA maps, every month of each year`))).toBeInTheDocument();
    for (const note of measure.notes) expect(screen.getByText(note)).toBeInTheDocument();
  });
});
