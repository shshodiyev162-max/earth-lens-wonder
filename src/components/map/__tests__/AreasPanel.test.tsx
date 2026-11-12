import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import AreasPanel from "../AreasPanel";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { areaKm2, bboxPolygon, type BBox } from "@/lib/geo/geometry";

const saved = (id: string, name: string, bbox: BBox) => {
  const geometry = bboxPolygon(bbox);
  return { id, name, kind: "rectangle", geometry, bbox, center: [0, 0], areaKm2: areaKm2(geometry), createdAt: "2026-11-10T00:00:00Z" };
};

function show() {
  return render(
    <MemoryRouter>
      <WorkspaceProvider>
        <AreasPanel layer={null} date={null} dateReady onZoomTo={() => undefined} />
      </WorkspaceProvider>
    </MemoryRouter>,
  );
}

const list = () => screen.getAllByRole("list")[0];

describe("combining saved areas", () => {
  beforeEach(() => {
    localStorage.setItem("terrascope.areas.v1", JSON.stringify([saved("a1", "North field", [60, 41, 61, 42]), saved("a2", "South field", [60, 40, 61, 41]), saved("a3", "Lake", [70, 40, 71, 41])]));
  });

  it("saves the ticked areas as one new area and keeps the originals", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Combine" }));
    const combine = screen.getByRole("button", { name: "Tick two or more" });
    expect(combine).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /North field/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /South field/ }));
    fireEvent.click(screen.getByRole("button", { name: "Combine 2 areas" }));

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const rows = within(list()).getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector("[translate=no]")?.textContent)).toEqual(["North field", "South field", "Lake", "North field + South field"]);
    expect(rows[3]).toHaveTextContent("Combined");
    expect(rows[3]).toHaveTextContent("2 areas");

    const stored = JSON.parse(localStorage.getItem("terrascope.areas.v1") as string);
    expect(stored[3]).toMatchObject({ kind: "combined", parts: ["North field", "South field"] });
    // Two fields side by side: their sizes add up.
    expect(stored[3].areaKm2).toBeCloseTo(stored[0].areaKm2 + stored[1].areaKm2, 3);
    expect(stored[3].geometry.type).toBe("MultiPolygon");
  });

  it("can be called off", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Combine" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Analyze with NASA data" })).toHaveLength(3);
  });

  it("isn't offered with fewer than two areas", () => {
    localStorage.setItem("terrascope.areas.v1", JSON.stringify([saved("a1", "North field", [60, 41, 61, 42])]));
    show();
    expect(screen.queryByRole("button", { name: "Combine" })).not.toBeInTheDocument();
  });
});
