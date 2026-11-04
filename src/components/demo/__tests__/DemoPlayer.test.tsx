import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import DemoPlayer, { type DemoControls } from "../DemoPlayer";
import { DEMOS, demoAttr, demoById, type DemoScript, type DemoTarget } from "@/lib/demo/scripts";

const SCRIPT: DemoScript = {
  id: "test",
  title: "A test demo",
  summary: "",
  steps: [
    { caption: "First, ask a question.", target: "question", action: { kind: "ask", text: "vegetation in Kenya" } },
    { caption: "Then wait for the maps.", target: "results", waitFor: "scan-done" },
    { caption: "Finally, look at the whole area.", target: "whole-area" },
  ],
};

function setup(ready = false) {
  const api: DemoControls = { act: vi.fn(), ready: vi.fn(() => ready), setPanel: vi.fn() };
  const onClose = vi.fn();
  const view = render(<DemoPlayer script={SCRIPT} controls={() => api} onChoose={vi.fn()} onClose={onClose} pace={60} />);
  return { api, onClose, view };
}

describe("DemoPlayer", () => {
  it("shows the first step and does its action", () => {
    const { api } = setup();
    expect(screen.getByText("First, ask a question.")).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 3/i)).toBeInTheDocument();
    expect(api.act).toHaveBeenCalledWith({ kind: "ask", text: "vegetation in Kenya" });
    expect(api.setPanel).toHaveBeenCalledWith(true);
  });

  it("goes forward and back with the buttons, and waits for NASA data", async () => {
    vi.useFakeTimers();
    try {
      let ready = false;
      const api: DemoControls = { act: vi.fn(), ready: vi.fn(() => ready), setPanel: vi.fn() };
      render(<DemoPlayer script={SCRIPT} controls={() => api} onChoose={vi.fn()} onClose={vi.fn()} pace={60} />);
      fireEvent.click(screen.getByRole("button", { name: /Next/ }));
      expect(screen.getByText("Then wait for the maps.")).toBeInTheDocument();
      await act(async () => vi.advanceTimersByTime(700));
      expect(screen.getByText(/Waiting for NASA's maps/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
      ready = true;
      await act(async () => vi.advanceTimersByTime(600));
      expect(screen.queryByText(/Waiting for NASA's maps/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Back/ }));
      expect(screen.getByText("First, ask a question.")).toBeInTheDocument();
      // Going back doesn't ask the question a second time.
      expect(api.act).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes with Escape or Finish", () => {
    const { onClose } = setup(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("lists the demos to choose from", () => {
    const onChoose = vi.fn();
    render(<DemoPlayer script={null} controls={() => ({ act: vi.fn(), ready: () => true, setPanel: vi.fn() })} onChoose={onChoose} onClose={vi.fn()} />);
    for (const demo of DEMOS) expect(screen.getByText(demo.title)).toBeInTheDocument();
    fireEvent.click(screen.getByText(DEMOS[1].title));
    expect(onChoose).toHaveBeenCalledWith(DEMOS[1].id);
  });
});

describe("demo scripts", () => {
  it("are found by id and each has a few steps with captions", () => {
    expect(demoById("vegetation")?.title).toMatch(/Uzbekistan/);
    expect(demoById("nope")).toBeNull();
    for (const demo of DEMOS) {
      expect(demo.steps.length).toBeGreaterThanOrEqual(4);
      for (const step of demo.steps) expect(step.caption.length).toBeGreaterThan(30);
    }
  });

  it("mark page parts with a data attribute the player can find", () => {
    const target: DemoTarget = "whole-area";
    expect(demoAttr(target)).toEqual({ "data-demo": "whole-area" });
  });

  it("never claim specific numbers (they come from the live data)", () => {
    for (const demo of DEMOS) for (const step of demo.steps) expect(step.caption).not.toMatch(/[+−-]?\d+\.\d+\s*(°C|NDVI|ppm|%)/);
  });
});
