import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Plot from "./Plot";
import AirMassAnimation from "./AirMassAnimation";
import {
  absoluteHumidity,
  dryAdiabaticLapseRate,
  moistAdiabaticLapseRate,
  generateTemperatureArray,
  round1,
  fmt1,
  parseDa,
  INPUT_RE,
  DEFAULT_ZOOM,
  COL,
  T_MIN,
  T_MAX,
} from "../utils/meteorology";

export default function AdiabaticCoolingApp() {
  const [inputTemp, setInputTemp] = useState("");
  const [inputDewPoint, setInputDewPoint] = useState("");
  const [coolingHeight, setCoolingHeight] = useState(1000); // meter
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);

  const zoomRef = useRef(DEFAULT_ZOOM);
  const applyZoom = (z) => {
    zoomRef.current = z;
    setCurrentZoom(z);
  };

  // Afledte værdier — samme valideringsmønster som luftfugtigheds-delen
  const temp = useMemo(() => {
    const v = parseDa(inputTemp);
    return inputTemp !== "" && !isNaN(v) ? v : null;
  }, [inputTemp]);
  const dewPoint = useMemo(() => {
    const v = parseDa(inputDewPoint);
    return inputDewPoint !== "" && !isNaN(v) ? v : null;
  }, [inputDewPoint]);

  const tempInRange = temp !== null && temp >= T_MIN && temp <= T_MAX;
  const dewInRange = dewPoint !== null && dewPoint >= T_MIN && dewPoint <= T_MAX;
  const pairEntered = tempInRange && dewInRange;
  const pairValid = pairEntered && dewPoint <= temp;

  // Adiabatisk beregning af de viste (afrundede) størrelser
  const result = useMemo(() => {
    if (!pairValid) return null;
    const heightKm = coolingHeight / 1000;
    const dryRate = dryAdiabaticLapseRate();
    const lclKm = (temp - dewPoint) / dryRate; // kondensationsniveau
    const condenses = lclKm < heightKm;

    let finalTemp;
    if (condenses) {
      const moistRate = moistAdiabaticLapseRate(dewPoint);
      finalTemp = dewPoint - moistRate * (heightKm - lclKm);
    } else {
      finalTemp = temp - dryRate * heightKm;
    }

    const startHum = absoluteHumidity(dewPoint);
    const finalHum = absoluteHumidity(finalTemp);
    const waterExcess = condenses ? Math.max(0, startHum - finalHum) : 0;

    return {
      heightKm,
      lclM: Math.round(lclKm * 1000),
      lclKm,
      condenses,
      finalTemp,
      finalTempD: round1(finalTemp),
      startHum,
      waterExcessD: condenses ? round1(waterExcess) : 0,
    };
  }, [pairValid, temp, dewPoint, coolingHeight]);

  // Auto-zoom så hele forløbet er synligt
  useEffect(() => {
    if (!result) return;
    const z = zoomRef.current;
    const minT = Math.min(result.finalTemp, dewPoint, temp);
    const maxT = temp;
    const maxH = Math.max(absoluteHumidity(dewPoint), absoluteHumidity(temp));
    const inView = minT >= z.x[0] && maxT <= z.x[1] && maxH <= z.y[1];
    if (inView) return;
    const margin = Math.max(3, (maxT - minT) * 0.2);
    applyZoom({
      x: [Math.max(T_MIN, minT - margin), Math.min(T_MAX, maxT + margin)],
      y: [0, maxH * 1.25],
    });
  }, [result, temp, dewPoint]);

  // Luftpakkens tilstand ved den aktuelle løftehøjde — én sandhedskilde
  const parcelState = useMemo(() => {
    if (!pairValid) return null;
    const h = coolingHeight / 1000;
    const dryRate = dryAdiabaticLapseRate();
    const lclKm = (temp - dewPoint) / dryRate;
    if (h <= lclKm) return { heightKm: h, temp: temp - dryRate * h, phase: "dry" };
    return {
      heightKm: h,
      temp: dewPoint - moistAdiabaticLapseRate(dewPoint) * (h - lclKm),
      phase: "moist",
    };
  }, [pairValid, temp, dewPoint, coolingHeight]);

  // Træk i luftpakken styrer løftehøjden (km → m, i trin af 10 m)
  const handleDragHeight = useCallback((heightKm) => {
    setCoolingHeight(Math.min(10000, Math.max(100, Math.round((heightKm * 1000) / 10) * 10)));
  }, []);

  const xs = useMemo(() => generateTemperatureArray(), []);
  const ys = useMemo(() => xs.map((T) => absoluteHumidity(T)), [xs]);

  const data = useMemo(() => {
    const traces = [
      {
        x: xs,
        y: ys,
        type: "scatter",
        mode: "lines",
        fill: "tozeroy",
        fillcolor: COL.fill,
        line: { width: 0 },
        name: "Umættet",
        showlegend: true,
        hoverinfo: "skip",
      },
      {
        x: xs,
        y: ys,
        type: "scatter",
        mode: "lines",
        name: "Mætningskurve",
        line: { width: 3, color: COL.curve },
        hovertemplate: "T: %{x:.1f} °C<br>Maksimalt vandindhold: %{y:.1f} g/m³<extra></extra>",
      },
    ];
    if (!result) return traces;

    const startHum = result.startHum;

    if (result.condenses) {
      // Tør adiabat: vandret mod venstre til mætningskurven (vandindholdet er konstant)
      traces.push({
        x: [temp, dewPoint],
        y: [startHum, startHum],
        type: "scatter",
        mode: "lines",
        name: "Tør adiabat (9,8 °C/km)",
        line: { color: COL.orange, width: 5, dash: "dot" },
        hovertemplate: `Tør adiabat<br>${fmt1(temp)} °C → ${fmt1(dewPoint)} °C<br>Kondensation ved ${result.lclM} m<extra></extra>`,
      });

      // Våd adiabat: følger mætningskurven ned til sluttemperaturen
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = dewPoint - ((dewPoint - result.finalTemp) * i) / 24;
        pts.push({ x: t, y: absoluteHumidity(t) });
      }
      traces.push({
        x: pts.map((p) => p.x),
        y: pts.map((p) => p.y),
        type: "scatter",
        mode: "lines",
        name: "Våd adiabat (følger kurven)",
        line: { color: COL.red, width: 5, dash: "dot" },
        hovertemplate: `Våd adiabat<br>${fmt1(dewPoint)} °C → ${fmt1(result.finalTempD)} °C<extra></extra>`,
      });

      // Kondensationspunkt
      traces.push({
        x: [dewPoint],
        y: [absoluteHumidity(dewPoint)],
        type: "scatter",
        mode: "markers",
        name: "Kondensation starter",
        marker: { color: COL.green, size: 12, line: { color: "#ffffff", width: 2 } },
        showlegend: false,
        hovertemplate: `Kondensation starter<br>T: ${fmt1(dewPoint)} °C · Højde: ${result.lclM} m<extra></extra>`,
      });

      // Slutpunkt
      traces.push({
        x: [result.finalTemp],
        y: [absoluteHumidity(result.finalTemp)],
        type: "scatter",
        mode: "markers",
        name: "Slutpunkt",
        marker: { color: COL.red, size: 12, symbol: "diamond", line: { color: "#ffffff", width: 2 } },
        showlegend: false,
        hovertemplate: `Slutpunkt (${coolingHeight} m)<br>T: ${fmt1(result.finalTempD)} °C<extra></extra>`,
      });
    } else {
      // Kun tør adiabat — når aldrig mætning
      traces.push({
        x: [temp, result.finalTemp],
        y: [startHum, startHum],
        type: "scatter",
        mode: "lines",
        name: "Tør adiabat (9,8 °C/km)",
        line: { color: COL.orange, width: 5, dash: "dot" },
        hovertemplate: `Tør adiabat<br>${fmt1(temp)} °C → ${fmt1(result.finalTempD)} °C<br>Ingen kondensation<extra></extra>`,
      });
      traces.push({
        x: [result.finalTemp],
        y: [startHum],
        type: "scatter",
        mode: "markers",
        name: "Slutpunkt",
        marker: { color: COL.orange, size: 12, symbol: "diamond", line: { color: "#ffffff", width: 2 } },
        showlegend: false,
        hovertemplate: `Slutpunkt (${coolingHeight} m)<br>T: ${fmt1(result.finalTempD)} °C<extra></extra>`,
      });
    }

    // Startpunkt: luftens tilstand ved jorden
    traces.push({
      x: [temp],
      y: [startHum],
      type: "scatter",
      mode: "markers",
      name: "Start (jordoverfladen)",
      marker: { color: COL.dark, size: 14, line: { color: "#ffffff", width: 2 } },
      showlegend: false,
      hovertemplate: `Start<br>T: ${fmt1(temp)} °C · Dugpunkt: ${fmt1(dewPoint)} °C<extra></extra>`,
    });

    // Luftpakkens aktuelle position (ved løftehøjden)
    if (parcelState) {
      const y = parcelState.phase === "dry" ? startHum : absoluteHumidity(parcelState.temp);
      traces.push({
        x: [parcelState.temp],
        y: [y],
        type: "scatter",
        mode: "markers",
        name: "Luftpakken nu",
        marker: {
          color: "#ffffff",
          size: 11,
          line: { color: COL.dark, width: 2.5 },
        },
        showlegend: false,
        hovertemplate: `Luftpakken<br>T: ${fmt1(parcelState.temp)} °C · Højde: ${Math.round(parcelState.heightKm * 1000)} m<extra></extra>`,
      });
    }

    return traces;
  }, [xs, ys, result, temp, dewPoint, coolingHeight, parcelState]);

  const layout = {
    xaxis: {
      title: { text: "Temperatur i °C", font: { size: 14, color: "#374151" } },
      range: currentZoom.x,
      gridcolor: "#f3f4f6",
      zerolinecolor: "#e5e7eb",
      showline: true,
      linecolor: "#e5e7eb",
      tickfont: { size: 12, color: "#6b7280" },
    },
    yaxis: {
      title: { text: "Absolut luftfugtighed (g vanddamp/m³)", font: { size: 14, color: "#374151" } },
      rangemode: "tozero",
      range: currentZoom.y,
      gridcolor: "#f3f4f6",
      zerolinecolor: "#e5e7eb",
      showline: true,
      linecolor: "#e5e7eb",
      tickfont: { size: 12, color: "#6b7280" },
    },
    separators: ",.",
    margin: { l: 80, r: 20, t: 20, b: 50 },
    hovermode: "closest",
    dragmode: "zoom",
    autosize: true,
    plot_bgcolor: "white",
    paper_bgcolor: "white",
    showlegend: true,
    legend: {
      x: 0.02,
      y: 0.98,
      xanchor: "left",
      yanchor: "top",
      bgcolor: "rgba(255,255,255,0.9)",
      bordercolor: "#e5e7eb",
      borderwidth: 1,
      font: { size: 12, color: "#374151" },
    },
  };

  const config = {
    displaylogo: false,
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: [
      "pan2d",
      "select2d",
      "lasso2d",
      "autoScale2d",
      "hoverClosestCartesian",
      "hoverCompareCartesian",
    ],
    toImageButtonOptions: {
      format: "png",
      filename: "adiabatisk_afkoeling",
      height: 800,
      width: 1200,
      scale: 2,
    },
  };

  const resetAndClear = () => {
    setInputTemp("");
    setInputDewPoint("");
    setCoolingHeight(1000);
    applyZoom(DEFAULT_ZOOM);
  };

  const handleInput = (setter) => (e) => {
    const value = e.target.value;
    if (value === "" || INPUT_RE.test(value)) setter(value);
  };

  const tempError =
    inputTemp !== "" && inputTemp !== "-" && temp !== null && !tempInRange
      ? `Temperatur skal være mellem ${T_MIN} °C og ${T_MAX} °C`
      : null;
  const dewRangeError =
    inputDewPoint !== "" && inputDewPoint !== "-" && dewPoint !== null && !dewInRange
      ? `Dugpunkt skal være mellem ${T_MIN} °C og ${T_MAX} °C`
      : null;
  const pairError =
    pairEntered && !pairValid
      ? "Dugpunktet kan ikke være højere end lufttemperaturen — ret et af felterne."
      : null;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Graf + animation */}
      <div className="flex-1 order-1 lg:order-2">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <Plot
              data={data}
              layout={layout}
              style={{ width: "100%", height: "70vh", minHeight: 400 }}
              config={config}
              useResizeHandler
              onRelayout={(eventData) => {
                if (
                  eventData["xaxis.range[0]"] !== undefined &&
                  eventData["xaxis.range[1]"] !== undefined &&
                  eventData["yaxis.range[0]"] !== undefined &&
                  eventData["yaxis.range[1]"] !== undefined
                ) {
                  applyZoom({
                    x: [eventData["xaxis.range[0]"], eventData["xaxis.range[1]"]],
                    y: [eventData["yaxis.range[0]"], eventData["yaxis.range[1]"]],
                  });
                }
              }}
            />
          </div>

          <div className="xl:col-span-1 bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col">
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Luftpakken</p>
            <p className="text-sm text-gray-500 font-light mb-3">Træk pakken op og ned</p>
            <div className="flex-1 min-h-[45vh]">
              <AirMassAnimation
                heightKm={coolingHeight / 1000}
                condensationHeightKm={result ? result.lclKm : null}
                temp={parcelState ? parcelState.temp : null}
                phase={parcelState ? parcelState.phase : "dry"}
                onDragHeight={handleDragHeight}
                isActive={pairValid}
              />
            </div>
            {parcelState && (
              <p
                className="mt-3 text-center text-sm font-medium"
                style={{ color: parcelState.phase === "dry" ? COL.orangeText : COL.redText }}
              >
                {parcelState.phase === "dry"
                  ? "Tør adiabatisk: 9,8 °C/km"
                  : `Våd adiabatisk: ${fmt1(moistAdiabaticLapseRate(dewPoint))} °C/km`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Kontrolpanel */}
      <div className="lg:w-80 flex-shrink-0 order-2 lg:order-1 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-light mb-5">
            Når luft stiger, afkøles den adiabatisk: først tørt (9,8 °C/km),
            og efter kondensation vådt langs mætningskurven.
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="adia-temp" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: COL.red }} aria-hidden="true"></span>
                Starttemperatur (°C)
              </label>
              <input
                id="adia-temp"
                type="text"
                inputMode="decimal"
                value={inputTemp}
                onChange={handleInput(setInputTemp)}
                placeholder={`${T_MIN} til ${T_MAX} °C`}
                aria-describedby="adia-temp-error"
                className={`w-full px-3 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  tempError || pairError ? "border-red-400 bg-red-50" : "border-gray-300"
                }`}
              />
              {tempError && (
                <p id="adia-temp-error" role="alert" className="text-xs text-red-700 mt-1">
                  {tempError}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="adia-dew" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: COL.green }} aria-hidden="true"></span>
                Dugpunktstemperatur (°C)
              </label>
              <input
                id="adia-dew"
                type="text"
                inputMode="decimal"
                value={inputDewPoint}
                onChange={handleInput(setInputDewPoint)}
                placeholder={`${T_MIN} til ${T_MAX} °C`}
                aria-describedby="adia-dew-error"
                className={`w-full px-3 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  dewRangeError || pairError ? "border-red-400 bg-red-50" : "border-gray-300"
                }`}
              />
              {(dewRangeError || pairError) && (
                <p id="adia-dew-error" role="alert" className="text-xs text-red-700 mt-1">
                  {dewRangeError || pairError}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="adia-height" className="flex items-center justify-between text-sm font-medium text-gray-700 mb-1.5">
                <span>Løftehøjde</span>
                <span className="text-gray-900">
                  {coolingHeight >= 1000
                    ? `${(coolingHeight / 1000).toFixed(1).replace(".", ",")} km`
                    : `${coolingHeight} m`}
                </span>
              </label>
              <input
                id="adia-height"
                type="range"
                min="100"
                max="10000"
                step="100"
                value={coolingHeight}
                onChange={(e) => setCoolingHeight(parseInt(e.target.value, 10))}
                className="w-full accent-blue-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                100 m til 10 km — eller træk direkte i luftpakken
              </p>
            </div>
          </div>

          <button
            onClick={resetAndClear}
            className="mt-5 w-full px-3 py-1.5 text-sm text-gray-400 hover:text-red-600 transition-colors"
          >
            Ryd og nulstil
          </button>
        </div>

        {/* Resultatkort — sluttemperaturen er helten */}
        {result && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">
              Temperatur efter {coolingHeight >= 1000
                ? `${(coolingHeight / 1000).toFixed(1).replace(".", ",")} km`
                : `${coolingHeight} m`} løft
            </p>
            <p className="text-4xl font-light mb-4 text-gray-900">
              {fmt1(result.finalTempD)} °C
            </p>

            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-gray-600">
                  <span className="w-2 h-2 rounded-full" style={{ background: COL.orange }}></span>
                  Tør adiabat
                </dt>
                <dd className="font-medium text-gray-900">
                  {result.condenses
                    ? `${fmt1(temp)} → ${fmt1(dewPoint)} °C`
                    : `${fmt1(temp)} → ${fmt1(result.finalTempD)} °C`}
                </dd>
              </div>
              {result.condenses && (
                <>
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-gray-600">
                      <span className="w-2 h-2 rounded-full" style={{ background: COL.green }}></span>
                      Kondensation ved
                    </dt>
                    <dd className="font-medium text-gray-900">{result.lclM} m</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-gray-600">
                      <span className="w-2 h-2 rounded-full" style={{ background: COL.red }}></span>
                      Våd adiabat
                    </dt>
                    <dd className="font-medium text-gray-900">
                      {fmt1(dewPoint)} → {fmt1(result.finalTempD)} °C
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-gray-600">
                      <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                      Vandoverskud
                    </dt>
                    <dd className="font-medium text-gray-900">{fmt1(result.waterExcessD)} g/m³</dd>
                  </div>
                </>
              )}
              {!result.condenses && (
                <p className="text-xs text-gray-500">
                  Luften når ikke sit kondensationsniveau ({result.lclM} m) —
                  ingen skydannelse.
                </p>
              )}
            </dl>

            {result.condenses && result.waterExcessD > 0 && (
              <p className="mt-3 text-xs text-gray-500 font-light">
                {fmt1(result.waterExcessD)} g vand pr. m³ luft kondenserer ud,
                når luften afkøles fra {fmt1(dewPoint)} °C til {fmt1(result.finalTempD)} °C
                langs mætningskurven.
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-gray-400 font-light px-1">
          Tør adiabatisk afkøling: 9,8 °C/km. Våd adiabatisk: 6,5–9,0 °C/km
          (temperaturafhængig, forenklet trinmodel). Magnus-formlen (Sonntag90)
          bruges til mætningskurven.
        </p>
      </div>
    </div>
  );
}
