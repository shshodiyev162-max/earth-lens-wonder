// Carbon factors for eco impact calculations
// Values are based on conservative estimates from environmental research

export type ActionCategory = "car" | "water" | "energy" | "waste" | "tree";

export interface CarbonFactor {
  category: ActionCategory;
  label: string;
  unit: string;
  factor: number; // kg CO2 per unit
  confidence: "low" | "medium" | "high";
  description: string;
  source: string;
}

export const CARBON_FACTORS: CarbonFactor[] = [
  {
    category: "car",
    label: "Reduced Car Travel",
    unit: "km",
    factor: 0.21, // Average car emits 210g CO2 per km
    confidence: "high",
    description: "Kilometers not driven. Based on average passenger vehicle emissions of 210g CO2/km.",
    source: "EPA estimates",
  },
  {
    category: "water",
    label: "Water Saved",
    unit: "liters",
    factor: 0.001, // Water treatment and heating
    confidence: "medium",
    description: "Liters of water saved. Includes energy for pumping and treatment.",
    source: "Water UK carbon footprint",
  },
  {
    category: "energy",
    label: "Energy Saved",
    unit: "kWh",
    factor: 0.5, // Average grid emission
    confidence: "high",
    description: "kWh of electricity saved. Based on global average grid emission factor.",
    source: "IEA statistics",
  },
  {
    category: "waste",
    label: "Waste Reduced",
    unit: "kg",
    factor: 2.5, // Landfill savings
    confidence: "low",
    description: "Kilograms of waste prevented from landfill. Includes methane avoidance.",
    source: "EPA waste hierarchy",
  },
  {
    category: "tree",
    label: "Tree Planting Equivalent",
    unit: "trees",
    factor: 21, // A tree absorbs ~21kg CO2/year
    confidence: "medium",
    description: "CO2 absorbed by one tree over one year. Trees absorb ~21kg CO2 annually.",
    source: "US Forest Service",
  },
];

export function getFactorForCategory(category: ActionCategory): CarbonFactor | undefined {
  return CARBON_FACTORS.find((f) => f.category === category);
}

export function calculateCO2Saved(category: ActionCategory, amount: number): number {
  const factor = getFactorForCategory(category);
  if (!factor) return 0;
  return amount * factor.factor;
}

export function getConfidenceLevel(category: ActionCategory): "low" | "medium" | "high" {
  const factor = getFactorForCategory(category);
  return factor?.confidence ?? "medium";
}

// Confidence explanations
export const CONFIDENCE_EXPLANATIONS = {
  low: "This estimate is approximate due to variable factors. Actual impact depends on local conditions.",
  medium: "This estimate is based on typical values. Individual results may vary based on location.",
  high: "This estimate is calculated from verified emission factors with good accuracy.",
};

