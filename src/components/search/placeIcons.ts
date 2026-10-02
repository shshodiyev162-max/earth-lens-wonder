import { Building2, Crosshair, Globe2, Landmark, Map as MapIcon, MapPin, Mountain, Waves } from "lucide-react";
import type { PlaceKind } from "@/lib/geo/geocode";

/** Icon shown next to a search result, by kind of place. */
export const KIND_ICON: Record<PlaceKind, typeof MapPin> = {
  coordinates: Crosshair,
  country: Globe2,
  state: Landmark,
  region: MapIcon,
  county: Landmark,
  city: Building2,
  district: MapPin,
  locality: MapPin,
  water: Waves,
  nature: Mountain,
  poi: MapPin,
  other: MapPin,
};
