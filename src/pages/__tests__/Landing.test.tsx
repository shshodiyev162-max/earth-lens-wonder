import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { STOPS } from "@/components/landing/story";
import { FINDINGS } from "@/components/landing/findings";
import { INDICATOR_ORDER, INDICATORS } from "@/lib/query/indicators";
import Landing from "../Landing";

vi.mock("@/components/CinematicEarth", () => ({ default: () => <div data-testid="planet" /> }));

beforeAll(() => {
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", Observer);
});

function renderPage() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe("the home page", () => {
  it("asks its question and offers one main action", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("What is changing on Earth, and is it real?");
    const main = screen.getAllByRole("link", { name: "Find changes" });
    expect(main[0].getAttribute("href")).toBe("/trends");
    expect(screen.getAllByRole("link", { name: "Watch a demo" })[0].getAttribute("href")).toBe("/trends?demo=choose");
  });

  it("has one place on the page for every stop on the planet's path", () => {
    const { container } = renderPage();
    expect(container.querySelectorAll("[data-stop]")).toHaveLength(STOPS.length);
  });

  it("answers yes, no and barely, with the numbers measured", () => {
    renderPage();
    for (const answer of ["Yes. Clearly.", "As a whole, no.", "There, yes.", "Barely. Maybe."]) {
      expect(screen.getByRole("heading", { name: answer })).toBeTruthy();
    }
    expect(screen.getByText("+0.61 °C")).toBeTruthy();
    expect(screen.getByText(/95% range \+0\.43 to \+0\.93 · p < 0\.001/)).toBeTruthy();
    expect(screen.getByText("No clear trend")).toBeTruthy();
    expect(screen.getByText(/p = 0\.80/)).toBeTruthy();
    expect(screen.getByText(/p = 0\.0478/)).toBeTruthy();
  });

  it("lets every result be run again", () => {
    renderPage();
    const hrefs = screen.getAllByRole("link", { name: "Run this test yourself" }).map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual([FINDINGS.mediterranean.link, FINDINGS.uzbekistan.link, FINDINGS.uzbekistan.link, FINDINGS.antarctica.link]);
  });

  it("describes each chart in words", () => {
    renderPage();
    expect(screen.getAllByRole("img").length).toBe(4);
    expect(screen.getByRole("img", { name: /Mediterranean/ })).toBeTruthy();
  });

  it("lists every measure, says how many there are, and opens each on the Trends page", () => {
    renderPage();
    expect(INDICATOR_ORDER).toHaveLength(29);
    const heading = screen.getByRole("heading", { name: /^Twenty-nine measures/ });
    // All the links at once: finding them one by one, 29 times, failed the time limit on a laptop on battery.
    const links = within(heading.closest("section") as HTMLElement).getAllByRole("link");
    for (const id of INDICATOR_ORDER) {
      const matching = links.filter((link) => link.textContent?.startsWith(INDICATORS[id].label));
      expect(matching, INDICATORS[id].label).toHaveLength(1);
      expect(matching[0].getAttribute("href")).toBe(`/trends?ind=${id}`);
    }
  });

  it("makes no claim the data can't back", () => {
    const { container } = renderPage();
    const words = container.textContent ?? "";
    expect(words).not.toMatch(/and why/i);
    expect(words).not.toMatch(/everything you need/i);
    expect(words).not.toMatch(/powered by nasa/i);
    expect(words).toMatch(/isn't affiliated with or endorsed by NASA/);
    expect(words).toMatch(/doesn't prove what caused it/);
  });

  it("has a footer with real links", () => {
    renderPage();
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: /NASA GIBS/ }).getAttribute("href")).toContain("earthdata.nasa.gov");
    expect(within(footer).getByRole("link", { name: /Source code/ }).getAttribute("href")).toContain("github.com");
    expect(within(footer).getByRole("link", { name: "Trends" }).getAttribute("href")).toBe("/trends");
  });
});
