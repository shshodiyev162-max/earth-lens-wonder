import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { PlaceResult } from "@/lib/geo/geocode";

export interface FocusState {
  focusPlace?: PlaceResult;
}

/**
 * Global search (navbar / landing) navigates to a map page with
 * `state.focusPlace`; map pages pick it up here exactly once.
 */
export function useRouteFocusPlace(onPlace: (place: PlaceResult) => void) {
  const location = useLocation();
  const navigate = useNavigate();
  const handled = useRef<string | null>(null);
  const callback = useRef(onPlace);
  callback.current = onPlace;

  useEffect(() => {
    const place = (location.state as FocusState | null)?.focusPlace;
    if (!place || handled.current === location.key) return;
    handled.current = location.key;
    callback.current(place);
    // Clear the state so a reload or back-navigation doesn't re-trigger it.
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location, navigate]);
}
