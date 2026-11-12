import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import L from "leaflet";
import FlyTo from "../FlyTo";

const map = {
  getSize: vi.fn(),
  getZoom: vi.fn(() => 3),
  getCenter: vi.fn(() => ({ lat: 36, lng: 18 })),
  setView: vi.fn(),
  flyTo: vi.fn(),
  flyToBounds: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  off: vi.fn(),
};

/** The listener the flight left on the map for an event. */
const listener = (event: string) => map.on.mock.calls.find(([name]) => name === event)?.[1];

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

  it("ends clear of whatever covers the map, when told what does", () => {
    render(<FlyTo target={{ key: 1, bbox: [56, 37, 73, 46], padding: { topLeft: [24, 104], bottomRight: [24, 461] } }} />);
    expect(map.flyToBounds.mock.calls[0][1]).toMatchObject({ paddingTopLeft: [24, 104], paddingBottomRight: [24, 461] });
    expect(map.flyToBounds.mock.calls[0][1].padding).toBeUndefined();
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

  it("redraws after a flight that landed without moving the tiles, which would leave them behind the outlines", () => {
    render(<FlyTo target={{ key: 1, bbox: [56, 37, 73, 46] }} />);
    listener("moveend")();
    expect(map.setView).toHaveBeenCalledWith({ lat: 36, lng: 18 }, 3, { reset: true });
    // Only once: the redraw itself ends with a "moveend".
    expect(map.off).toHaveBeenCalledWith("moveend", listener("moveend"));
  });

  it("leaves a normal flight alone, so the tiles don't flash", () => {
    render(<FlyTo target={{ key: 1, bbox: [56, 37, 73, 46] }} />);
    listener("zoom")();
    listener("moveend")();
    expect(map.setView).not.toHaveBeenCalled();
  });

  it("stops watching a flight when the map goes away", () => {
    const { unmount } = render(<FlyTo target={{ key: 1, bbox: [56, 37, 73, 46] }} />);
    unmount();
    expect(map.off).toHaveBeenCalledWith("zoom", listener("zoom"));
    expect(map.off).toHaveBeenCalledWith("moveend", listener("moveend"));
  });

  it("uses the one kind of redraw that really moves what was left behind, on a real Leaflet map", () => {
    const box = document.createElement("div");
    Object.defineProperty(box, "clientWidth", { value: 800 });
    Object.defineProperty(box, "clientHeight", { value: 600 });
    document.body.append(box);
    const real = L.map(box, { zoomAnimation: false, fadeAnimation: false }).setView([0, 0], 3);
    const bounds = L.latLngBounds([30, -5], [46, 36]);
    const image = L.imageOverlay("data:,", bounds).addTo(real);
    const position = () => L.DomUtil.getPosition(image.getElement() as HTMLElement);
    const inLine = () => real.latLngToLayerPoint(bounds.getNorthWest());

    // A flight that drew no frames: straight to the end, at the zoom it began at.
    const flight = real as unknown as { _move(center: L.LatLng, zoom: number): typeof flight; _moveEnd(zoomChanged: boolean): typeof flight };
    flight._move(L.latLng(20, 40), 3)._moveEnd(true);
    expect(position()).not.toEqual(inLine());

    // The trap: asking for the same view without "reset" does nothing.
    real.setView(real.getCenter(), real.getZoom(), { animate: false });
    expect(position()).not.toEqual(inLine());

    real.setView(real.getCenter(), real.getZoom(), { reset: true } as L.ZoomPanOptions);
    expect(position()).toEqual(inLine());
    real.remove();
    box.remove();
  });

  it("does nothing without a target", () => {
    render(<FlyTo target={null} />);
    expect(map.flyTo).not.toHaveBeenCalled();
    expect(map.flyToBounds).not.toHaveBeenCalled();
  });
});
