"use client";

import { useState } from "react";
import StockPicker, { StockData } from "./StockPicker";
import ForecastControls, { ForecastParams } from "./ForecastControls";
import PriceInsights from "./PriceInsights";
import PriceFanChart from "./PriceFanChart";
import PriceHistogram from "./PriceHistogram";
import { useSimulation } from "@/lib/useSimulation";
import { ForecastInput, ForecastOutput } from "@/lib/sim/forecast";
import { TRADING_DAYS } from "@/lib/calibrate";

const DEFAULT_PARAMS: ForecastParams = {
  nPaths: 20000,
  horizonDays: 63,
  targetPrice: "",
  annualDrift: 0.08,
  baseVol: 0.25,
  tailAlpha: 3,
  jumpIntensity: 1.0,
  swanProb: 0.1,
  swanMagnitude: 0.4,
  swanDirection: -1,
  compareGaussian: true,
};

export default function ForecastMode() {
  const { runForecastPrimary, running } = useSimulation();
  const [stock, setStock] = useState<StockData | null>(null);
  const [params, setParams] = useState<ForecastParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<ForecastOutput | null>(null);

  function handleSelect(s: StockData) {
    setStock(s);
    setResult(null);
    // Pre-fill the fat-tail knobs from the calibration.
    setParams((p) => ({
      ...p,
      annualDrift: clamp(s.calibration.annualDrift, -0.3, 0.4),
      baseVol: clamp(s.calibration.annualVol, 0.05, 0.8),
      tailAlpha: clamp(s.calibration.tailAlpha, 1.5, 6),
      jumpIntensity: s.calibration.jumpIntensity,
    }));
  }

  async function handleRun() {
    if (!stock) return;
    const input: ForecastInput = {
      s0: stock.price,
      tYears: params.horizonDays / TRADING_DAYS,
      r: params.annualDrift,
      baseVol: params.baseVol,
      jumpIntensity: params.jumpIntensity,
      tailAlpha: params.tailAlpha,
      swanProb: params.swanProb,
      swanMagnitude: params.swanMagnitude,
      swanDirection: params.swanDirection,
      nPaths: params.nPaths,
      targetPrice: params.targetPrice === "" ? undefined : params.targetPrice,
    };
    const out = await runForecastPrimary(input);
    setResult(out);
  }

  const currency = stock?.currency ?? "USD";

  return (
    <>
      <StockPicker selected={stock} onSelect={handleSelect} />
      <ForecastControls
        params={params}
        setParams={setParams}
        onRun={handleRun}
        running={running}
        disabled={!stock}
        currency={currency}
      />
      {result ? (
        <>
          <PriceInsights r={result} currency={currency} />
          <PriceFanChart fan={result.fan} tYears={result.tYears} currency={currency} />
          <PriceHistogram bins={result.histogram} compareGaussian={params.compareGaussian} />
        </>
      ) : (
        <div className="panel">
          <p className="desc" style={{ margin: 0 }}>
            종목을 고르고 시행 횟수·기간을 정한 뒤 <b>실행</b>을 누르세요. 멱법칙(팻테일) 점프와
            블랙스완을 얹은 몬테카를로가 브라우저에서 돌며 가격의 확률 분포·꼬리 위험을 계산합니다.
          </p>
        </div>
      )}
    </>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
