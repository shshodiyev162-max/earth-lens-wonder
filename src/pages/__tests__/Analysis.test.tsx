import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Analysis from "../Analysis";
import { RegionProvider } from "@/context/RegionContext";
import * as analysisClient from "@/lib/analysisClient";

describe("Analysis page", () => {
  it("runs AI analysis and displays summary", async () => {
    vi.spyOn(analysisClient, "runMapAnalysis").mockResolvedValueOnce({
      summary: "Mock summary for testing.",
      bullets: ["Point one", "Point two"],
      riskLevel: "low",
    });

    render(<MemoryRouter><RegionProvider><Analysis /></RegionProvider></MemoryRouter>);

    const runButton = screen.getByRole("button", { name: /run ai analysis/i });
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(screen.getByText(/Mock summary for testing./i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Point one/i)).toBeInTheDocument();
  });
});



