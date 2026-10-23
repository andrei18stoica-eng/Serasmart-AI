---
name: forecasting
description: Forecasts a time series (sales, demand, traffic, prices) with methods suited to the data, and shows how reliable the forecast is.
---
# Forecasting — Serasmart AI

## Look at the data first
Frequency (daily, monthly), length, trend, seasonality, outliers, missing values, holidays and one-off events.

## Choose the method
- Short or simple series: seasonal naive, exponential smoothing (ETS, Holt-Winters).
- Clear seasonality and trend: SARIMA / auto-ARIMA (`statsmodels`, `pmdarima`), Prophet.
- Many related series or many explanatory variables: gradient boosting (LightGBM) with lag and calendar features.
- Pretrained forecasting models exist too; check each model's licence before commercial use (some allow research use only).

## Do it properly
- Keep the last part of the data for testing (time order, never shuffle); compare with a naive forecast.
- Report MAE and MAPE (or sMAPE when values are near zero) on the test part.
- Show prediction intervals, not just one line.
- Write the code (Python), a chart description, and a plain-words conclusion with the risks.
