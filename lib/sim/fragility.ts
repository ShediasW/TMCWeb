export interface FragilityResult {
  verdict: "ANTIFRAGILE" | "ROBUST" | "FRAGILE";
  convexityIndex: number;
  ruinProb: number;
  worstLossPct: number;
  tailAsymmetry: number;
  volSweep: { volScale: number; meanPnlPct: number }[];
  pnlSample: number[];
}
