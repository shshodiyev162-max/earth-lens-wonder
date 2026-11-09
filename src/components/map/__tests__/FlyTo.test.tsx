import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import FlyTo from "../FlyTo";

const map = {
  getSize: vi.fn(),
  getZoom: vi.fn(() => 3),
  flyTo: vi.fn(),
  flyToBounds: vi.fn(),
  once: vi.fn(),
  off: vi.fn(),
};

vi.mock("react-leaflet", () => ({ useMap: () => map }));

describe("flying the map to a place", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    map.getSize.mockReturnValue({ x: 800, y: 600 });
  });

  it("flies to an area straight away when the map has a size", () => {
    render(<FlyTo target={{ key: 1, bbox: [56, 37, 73, 46] }} />);
    expect(map.flyToBounds).toHaveBeenCalledTimes(1);
    expect(map.once).not.toHaveBeenCalled();
  });

  it("flies to a single point", () => {
    render(<FlyTo target={{ key: 1, bbox: [60, 40, 60, 40], zoom: 8 }} />);
    expect(map.flyTo).toHaveBeenCalledWith([40, 60], 8, { duration: 1.2 });
    render(<FlyTo target={{ key: 2, center: [10, 20], zoom: 14 }} maxZoom={11} />);
    expect(map.flyTo).toHaveBeenLastCalledWith([10, 20], 11, { duration: 1.2 });
  });

  it("waits for a size in a hidden tab, where Leaflet would otherwise throw and take the page down", () => {
    map.getSize.mockReturnValue({ x: 0, y: 0 });
    const { unmount } = render(<FlyTo target={{ key: 1, bbox: [56, 37, 73, 46] }} />);
    expect(map.flyToBounds).not.toHaveBeenCalled();
    expect(map.once).toHaveBeenCalledWith("resize", expect.any(Function));
    // The tab comes to the front.
    map.once.mock.calls[0][1]();
    expect(map.flyToBounds).toHaveBeenCalledTimes(1);
    unmount();
    expect(map.off).toHaveBeenCalledWith("resize", map.once.mock.calls[0][1]);
  });

  it("does nothing without a target", () => {
    render(<FlyTo target={null} />);
    expect(map.flyTo).not.toHaveBeenCalled();
    expect(map.flyToBounds).not.toHaveBeenCalled();
  });
});
