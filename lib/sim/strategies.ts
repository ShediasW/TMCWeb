export interface Leg {
  type: "stock" | "call" | "put" | "cash";
  side: "long" | "short";
  fraction: number;    // fraction of capital allocated / received
  strikeRatio: number; // strike = strikeRatio * S0
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  legs: Leg[];
}

export const PRESET_STRATEGIES: Strategy[] = [
  {
    id: "buy-and-hold",
    name: "바이앤홀드",
    description: "자본의 100%를 주식(지수)에 투자. 단순하지만 블랙스완에 오목 노출.",
    legs: [{ type: "stock", side: "long", fraction: 1.0, strikeRatio: 1.0 }],
  },
  {
    id: "barbell",
    name: "바벨",
    description:
      "90% 현금(안전자산) + 10% 심외가 콜옵션 매수. 탈레브의 대표 안티프래질 구조.",
    legs: [
      { type: "cash", side: "long", fraction: 0.9, strikeRatio: 1.0 },
      { type: "call", side: "long", fraction: 0.1, strikeRatio: 1.2 },
    ],
  },
  {
    id: "tail-hedge",
    name: "테일 헤지",
    description: "95% 주식 + 5% 심외가 풋옵션 매수. 테일 리스크를 헤지하는 보험 전략.",
    legs: [
      { type: "stock", side: "long", fraction: 0.95, strikeRatio: 1.0 },
      { type: "put", side: "long", fraction: 0.05, strikeRatio: 0.8 },
    ],
  },
  {
    id: "short-vol",
    name: "숏 볼",
    description:
      "변동성 매도: OTM 콜 매도 + 현금 보유. 무질서 확대에 취약한 프래질 구조.",
    legs: [
      { type: "cash", side: "long", fraction: 1.0, strikeRatio: 1.0 },
      { type: "call", side: "short", fraction: 0.04, strikeRatio: 1.3 },
    ],
  },
  {
    id: "naked-put",
    name: "네이키드 풋 매도",
    description:
      "현금 담보 + ATM 풋 매도. 시장 하락 시 무한 손실 위험 — 대표적 프래질.",
    legs: [
      { type: "cash", side: "long", fraction: 1.0, strikeRatio: 1.0 },
      { type: "put", side: "short", fraction: 0.06, strikeRatio: 1.0 },
    ],
  },
  {
    id: "covered-call",
    name: "커버드 콜",
    description: "주식 보유 + OTM 콜 매도. 상방을 제한하되 소폭 프리미엄 수취.",
    legs: [
      { type: "stock", side: "long", fraction: 1.0, strikeRatio: 1.0 },
      { type: "call", side: "short", fraction: 0.04, strikeRatio: 1.2 },
    ],
  },
  {
    id: "cash",
    name: "전액 현금",
    description: "전 자산을 무위험 자산(T-bill)에 보유. 로버스트하지만 기회비용 존재.",
    legs: [{ type: "cash", side: "long", fraction: 1.0, strikeRatio: 1.0 }],
  },
];

export function getPreset(id: string): Strategy | undefined {
  return PRESET_STRATEGIES.find((s) => s.id === id);
}
