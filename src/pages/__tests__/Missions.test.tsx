import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as apiClient from "@/lib/apiClient";
import Missions from "../Missions";

describe("Missions page", () => {
  it("toggles mission completion in the UI", async () => {
    vi.spyOn(apiClient, "apiFetch").mockResolvedValueOnce(null as any);

    render(<Missions />);

    const firstMission = await screen.findByText(/Recycle 10 bottles/i);

    fireEvent.click(firstMission);

    const co2Text = await screen.findByText(/missions completed/i);
    expect(co2Text.textContent).toMatch(/1\/6 missions completed/);
  });
});

