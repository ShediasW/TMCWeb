// Preset strategies that make the fragile ↔ antifragile spectrum tangible.
// These are the "actions based on a prediction" that the simulator scores — the
// point is never whether the prediction is right, but how the action behaves
// when the Black Swan arrives.

import { Strategy } from "./payoff";

export const PRESET_STRATEGIES: Strategy[] = [
  {
    id: "buy_hold",
    name: "바이앤홀드 (Buy & Hold)",
    description: "자본 100%를 주식에 투자. 선형 노출 — 블랙스완에 그대로 노출된다.",
    legs: [{ kind: "stock", dir: 1, weight: 1.0 }],
  },
  {
    id: "barbell",
    name: "바벨 (Barbell 90/10)",
    description:
      "90% 현금(극도의 안전) + 10% OTM 콜(극도의 위험). 탈레브가 권하는 볼록 전략 — 하방은 10%로 제한, 상방은 열림.",
    legs: [
      { kind: "cash", dir: 1, weight: 0.9 },
      { kind: "call", dir: 1, weight: 0.1, moneyness: 1.3 },
    ],
  },
  {
    id: "tail_hedge",
    name: "테일 헤지 (Protective Put)",
    description: "주식 100% + 자본 5%로 OTM 풋 매수. 보험을 깔아 하방을 잘라낸다.",
    legs: [
      { kind: "stock", dir: 1, weight: 1.0 },
      { kind: "put", dir: 1, weight: 0.05, moneyness: 0.8 },
    ],
  },
  {
    id: "short_vol",
    name: "숏 볼 (Short Strangle)",
    description:
      "OTM 콜과 풋을 동시에 매도해 프리미엄 수취. 평소엔 꾸준히 벌지만 블랙스완에 블로우업하는 전형적 프래질 전략.",
    legs: [
      { kind: "call", dir: -1, weight: 0.1, moneyness: 1.2 },
      { kind: "put", dir: -1, weight: 0.1, moneyness: 0.8 },
    ],
  },
  {
    id: "naked_put",
    name: "네이키드 풋 매도",
    description: "OTM 풋 매도로 프리미엄 수취. 하락장에서 무한에 가까운 손실 — 오목/프래질.",
    legs: [{ kind: "put", dir: -1, weight: 0.15, moneyness: 0.85 }],
  },
  {
    id: "covered_call",
    name: "커버드 콜",
    description: "주식 보유 + OTM 콜 매도. 상방을 팔아 약간의 프리미엄을 얻지만 하방은 그대로.",
    legs: [
      { kind: "stock", dir: 1, weight: 1.0 },
      { kind: "call", dir: -1, weight: 0.05, moneyness: 1.1 },
    ],
  },
  {
    id: "all_cash",
    name: "전액 현금",
    description: "무위험 수익률만. 변동성에 무관 — 로버스트의 기준선.",
    legs: [{ kind: "cash", dir: 1, weight: 1.0 }],
  },
];

export function getPreset(id: string): Strategy | undefined {
  return PRESET_STRATEGIES.find((s) => s.id === id);
}
