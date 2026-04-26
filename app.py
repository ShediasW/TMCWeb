import streamlit as st
import yfinance as yf
import pandas as pd
import numpy as np
from scipy.stats import norm
import matplotlib.pyplot as plt
from datetime import datetime, timedelta
import gc
from numba import jit

st.set_page_config(page_title="Antifragile Options Scanner", layout="wide")

TARGET_DTE = 500
N_PATHS = 200000 
RISK_FREE_RATE = 0.045
HISTORICAL_START = "2010-01-01"

@st.cache_data(ttl=86400)
def get_sp500_tickers():
    url = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv'
    df = pd.read_csv(url)
    return df['Symbol'].str.replace('.', '-').tolist()

def black_scholes(S, K, T, r, sigma, opt_type='C'):
    if T <= 0 or sigma <= 0: return 0.0
    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)
    if opt_type == 'C':
        return float(S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2))
    return float(K * np.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1))

@jit(nopython=True, cache=True)
def bates_stress_paths_optimized(S0, T, base_vol, r, n_paths, shock_dir):
    np.random.seed(42)
    steps = 15
    dt = T / steps
    paths = np.ones(n_paths, dtype=np.float32) * S0
    vols = np.ones(n_paths, dtype=np.float32) * base_vol

    for step in range(steps):
        z = np.random.standard_normal(n_paths).astype(np.float32)
        nj = np.random.poisson(1.0 * dt, n_paths)
        js = np.zeros(n_paths, dtype=np.float32)

        max_nj = nj.max()
        if max_nj > 0:
            for i in range(1, max_nj + 1):
                for p in range(n_paths):
                    if nj[p] >= i:
                        u = np.random.uniform(0.001, 0.999)
                        direction = 1.0 if np.random.rand() > 0.5 else -1.0
                        jump_size = (0.15 / (1.0 - u)**(1.0/3.0)) * direction
                        js[p] += jump_size
                        vols[p] *= (1.0 + np.abs(jump_size))

        for p in range(n_paths):
            if np.random.rand() < (0.05 * dt):
                js[p] += 0.50 * shock_dir
                vols[p] *= 2.0

        drift = (r - 0.5 * vols**2) * dt
        paths *= np.exp(drift + vols * np.sqrt(dt) * z + js)
        
        for p in range(n_paths):
            vols[p] = base_vol if (vols[p] * 0.85) < base_vol else (vols[p] * 0.85)

    return paths

@st.cache_data(ttl=3600)
def fetch_stock_data(ticker):
    t = yf.Ticker(ticker)
    h = t.history(period="5d")
    hist = yf.download(ticker, start=HISTORICAL_START, progress=False)
    close_data = hist['Close'][ticker] if isinstance(hist.columns, pd.MultiIndex) else hist['Close']
    rets = np.log(close_data / close_data.shift(1)).dropna()
    base_vol = float(rets.iloc[-252:].std() * np.sqrt(252))
    return t, h['Close'].iloc[-1], base_vol

st.title("🦢 Antifragile Signal Generator")
tickers = get_sp500_tickers()

col1, col2 = st.columns([1, 3])
with col1:
    st.subheader("Target Selection")
    selected_ticker = st.selectbox("Ticker", tickers, index=tickers.index("CVX") if "CVX" in tickers else 0)
    tail_edge_threshold = st.number_input("Tail_Edge Threshold", min_value=1.0, value=5.0, step=0.5)
    analyze_btn = st.button("Run Simulation")

if analyze_btn:
    with st.spinner("최초 1회 실행 시 Numba 컴파일 지연이 발생할 수 있습니다..."):
        try:
            t, S0, base_vol = fetch_stock_data(selected_ticker)
            exps = t.options
            if not exps:
                st.error("옵션 체인 데이터가 없습니다.")
                st.stop()

            target_date = datetime.now() + timedelta(days=TARGET_DTE)
            best_exp = min(exps, key=lambda x: abs((datetime.strptime(x, '%Y-%m-%d') - target_date).days))
            T_years = (datetime.strptime(best_exp, '%Y-%m-%d') - datetime.now()).days / 365.0
            opt_chain = t.option_chain(best_exp)

            paths_up = bates_stress_paths_optimized(S0, T_years, base_vol, RISK_FREE_RATE, N_PATHS, 1)
            paths_down = bates_stress_paths_optimized(S0, T_years, base_vol, RISK_FREE_RATE, N_PATHS, -1)

            results = []
            for side, chain in [('C', opt_chain.calls), ('P', opt_chain.puts)]:
                target_options = chain[chain['strike'] >= S0 * 1.3] if side == 'C' else chain[chain['strike'] <= S0 * 0.7]

                for _, row in target_options.iterrows():
                    K, premium = row['strike'], row['ask'] if row['ask'] > 0 else row['lastPrice']
                    if premium <= 0.10: continue

                    payoff = np.maximum(paths_up - K, 0) if side == 'C' else np.maximum(K - paths_down, 0)
                    expected_value = float(np.mean(payoff)) * np.exp(-RISK_FREE_RATE * T_years)
                    tail_edge = expected_value / (premium + 1e-9)

                    if tail_edge >= tail_edge_threshold:
                        results.append({
                            "Ticker": selected_ticker, "Type": side, "Expiry": best_exp,
                            "Strike": K, "Premium": premium, "Tail_Edge": round(tail_edge, 2)
                        })

            del paths_up, paths_down
            gc.collect()

            if results:
                df_res = pd.DataFrame(results).sort_values(by="Tail_Edge", ascending=False)
                st.dataframe(df_res, use_container_width=True)
                
                best_opt = df_res.iloc[0]
                fig, ax = plt.subplots(figsize=(8, 4))
                stock_prices = np.linspace(S0 * 0.2, S0 * 1.8, 100)
                
                if best_opt['Type'] == 'C':
                    payoffs = np.maximum(stock_prices - best_opt["Strike"], 0) - best_opt["Premium"]
                else:
                    payoffs = np.maximum(best_opt["Strike"] - stock_prices, 0) - best_opt["Premium"]

                ax.plot(stock_prices, payoffs, color='red')
                ax.axhline(0, color='black', linewidth=0.8)
                ax.axvline(S0, color='gray', linestyle='--', label="Current Price")
                ax.fill_between(stock_prices, 0, payoffs, where=(payoffs > 0), color='green', alpha=0.3)
                ax.set_title(f"Convexity Payoff: {best_opt['Type']} Strike ${best_opt['Strike']}")
                
                with col2:
                    st.pyplot(fig)
                
                fig.clf()
                plt.close(fig)
                
            else:
                st.warning("설정된 임계값을 초과하는 옵션이 존재하지 않습니다.")

        except Exception as e:
            st.error(f"연산 오류: {e}")
