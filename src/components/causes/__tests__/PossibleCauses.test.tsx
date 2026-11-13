import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PossibleCauses from "../PossibleCauses";
import { clearFinishedCauses } from "@/hooks/usePossibleCauses";
import { POWER_PARAMETERS, type PowerMonthly } from "@/lib/analysis/power";
import type { CauseLoaders } from "@/lib/causes/gather";
import type { CauseSetup } from "@/lib/causes/requests";
import { bboxPolygon } from "@/lib/geo/geometry";
import { COVER_GROUPS, type CoverGroup, type LandCover } from "@/lib/trends/landcover";

const YEARS = Array.from({ length: 16 }, (_, i) => 2005 + i);
const GROWING = [4, 5, 6, 7, 8, 9];
const rainFor = (year: number) => 2.2 - 0.06 * (year - 2005) + 0.3 * [1, -0.6, 0.3, -1, 0.8, -0.2, 0.5, -0.8][year % 8];

/** Rain that falls over the years (mm/day), and steady temperature. */
function power(): PowerMonthly {
  const out = Object.fromEntries(POWER_PARAMETERS.map((name) => [name, {}])) as PowerMonthly;
  for (let year = 2003; year <= 2020; year++) {
    for (let month = 1; month <= 12; month++) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      // Season-year rain: from October of the year before.
      out.PRECTOTCORR[key] = rainFor(month >= 10 ? year + 1 : year);
      out.T2M[key] = 20 + 0.1 * Math.sin(year * 3 + month);
      out.GWETROOT[key] = 0.3;
      out.WS2M[key] = 3;
    }
  }
  return out;
}

function cover(shares: Partial<Record<CoverGroup, number>>): LandCover {
  const full = Object.fromEntries(COVER_GROUPS.map((g) => [g, shares[g] ?? 0])) as Record<CoverGroup, number>;
  return { year: 2024, km2: full, totalKm2: 800, shares: full };
}

/** Greenness that follows the rain closely. */
const setup: CauseSetup = {
  unavailable: null,
  request: {
    family: "plants",
    direction: "decline",
    noun: "plant greenness",
    series: YEARS.map((year) => ({ year, value: 0.1 + 0.012 * rainFor(year) * 30 })),
    months: GROWING,
    geometry: bboxPolygon([64, 39, 65, 40]),
    bbox: [64, 39, 65, 40],
    points: [[39.5, 64.5]],
  },
};

function loaders(overrides: Partial<CauseLoaders> = {}): CauseLoaders {
  return {
    power: vi.fn(async () => power()),
    fireDay: vi.fn(async () => false),
    people: vi.fn(async (_g, _b, year: number) => ({ year, people: 50_000, km2: 800, crowdedShare: 0 })),
    landCover: vi.fn(async () => cover({ grass: 0.55, cropland: 0.35, barren: 0.1 })),
    ...overrides,
  };
}

describe("what may be behind a change", () => {
  beforeEach(() => clearFinishedCauses());

  it("waits to be asked, then lists the causes that fit and what was checked", async () => {
    const fake = loaders();
    render(<PossibleCauses setup={setup} loaders={fake} />);
    expect(screen.getByText("What may be behind it")).toBeInTheDocument();
    // Nothing is read from NASA until asked.
    expect(fake.power).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Look for possible causes" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Checking the weather, fires and people here");

    const list = await screen.findByRole("list", { name: "Possible causes, strongest evidence first" });
    const first = within(list).getAllByRole("listitem")[0];
    expect(within(first).getByRole("heading", { name: "Drier years" })).toBeInTheDocument();
    expect(first).toHaveTextContent("Strong evidence");
    expect(first).toHaveTextContent("In years with less rain, plant greenness here is lower.");
    // People didn't change, so they aren't offered as a cause.
    expect(screen.queryByRole("heading", { name: "More people living here" })).not.toBeInTheDocument();

    expect(screen.getByText("What was checked")).toBeInTheDocument();
    expect(screen.getByText("Weather (NASA POWER)")).toBeInTheDocument();
    expect(screen.getByText("Land in 2024 (MODIS land cover)")).toBeInTheDocument();
    expect(screen.getByText(/Not measured here: grazing/)).toHaveTextContent("not proof of what happened");
  });

  it("says why it can't look when there are too few years", () => {
    render(<PossibleCauses setup={{ request: null, unavailable: "Looking for causes needs at least 8 years with data, and this has 2. Choose a longer period to look." }} loaders={loaders()} />);
    expect(screen.getByText(/needs at least 8 years/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Look for possible causes" })).not.toBeInTheDocument();
  });

  it("still answers when some of NASA's services don't, saying which", async () => {
    render(
      <PossibleCauses
        setup={setup}
        loaders={loaders({
          power: async () => {
            throw new Error("NASA POWER returned 503");
          },
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Look for possible causes" }));
    expect(await screen.findByText("No cause stands out: none of the checks below points to one.")).toBeInTheDocument();
    expect(screen.getByText("NASA POWER couldn't be reached, so the weather wasn't checked.")).toBeInTheDocument();
  });

  it("shows a finished answer again without reading NASA twice", async () => {
    const fake = loaders();
    const { unmount } = render(<PossibleCauses setup={setup} loaders={fake} />);
    fireEvent.click(screen.getByRole("button", { name: "Look for possible causes" }));
    await screen.findByRole("heading", { name: "Drier years" });
    unmount();
    render(<PossibleCauses setup={setup} loaders={fake} />);
    expect(screen.getByRole("heading", { name: "Drier years" })).toBeInTheDocument();
    expect(fake.power).toHaveBeenCalledTimes(1);
  });
});
