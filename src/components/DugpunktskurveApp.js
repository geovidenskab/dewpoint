import React, { useEffect, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import { InlineMath } from "react-katex";
import Plot from "./Plot";
import {
  absoluteHumidity,
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

export default function DugpunktskurveApp() {
  const [plotKey, setPlotKey] = useState(0);
  const [inputTemp, setInputTemp] = useState("");
  const [inputDewPoint, setInputDewPoint] = useState("");
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const [showExplanation, setShowExplanation] = useState(false);
  const [animationStep, setAnimationStep] = useState(0);
  const [pulseOpacity, setPulseOpacity] = useState(1);
  const [showUnsaturated, setShowUnsaturated] = useState(true);

  // zoomRef spejler currentZoom, så auto-zoomet kan læse den aktuelle værdi
  // uden at have currentZoom som effect-dependency (ville give zoom-ryk ved pan)
  const zoomRef = useRef(DEFAULT_ZOOM);
  const applyZoom = (z) => {
    zoomRef.current = z;
    setCurrentZoom(z);
  };

  // Afledte værdier — ingen setState under render
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
  // Ét fælles gyldighedstjek, uanset hvilket felt der blev ændret sidst:
  const pairValid = pairEntered && dewPoint <= temp;

  const intersection = useMemo(() => {
    if (!pairValid) return null;
    const maks = absoluteHumidity(temp);
    const faktisk = absoluteHumidity(dewPoint);
    const maksD = round1(maks);
    const faktiskD = round1(faktisk);
    // RH af de viste tal, så brøken altid giver resultatet
    const rhD = round1((faktiskD / maksD) * 100);
    return { maks, faktisk, maksD, faktiskD, rhD };
  }, [pairValid, temp, dewPoint]);

  // Auto-zoom: kun når et punkt ligger uden for det synlige udsnit, og uden
  // Plotly-remount (akse-ranges er bundet til currentZoom).
  useEffect(() => {
    if (!pairValid) return;
    const tempHum = absoluteHumidity(temp);
    const dewHum = absoluteHumidity(dewPoint);
    const z = zoomRef.current;
    const inView =
      Math.min(temp, dewPoint) >= z.x[0] &&
      Math.max(temp, dewPoint) <= z.x[1] &&
      Math.max(tempHum, dewHum) <= z.y[1];
    if (inView) return;

    const minTemp = Math.min(temp, dewPoint);
    const maxTemp = Math.max(temp, dewPoint);
    const maxHum = Math.max(tempHum, dewHum);
    const tempMargin = Math.max(3, (maxTemp - minTemp) * 0.2);
    const humMargin = Math.max(1, maxHum * 0.15);
    applyZoom({
      x: [Math.max(T_MIN, minTemp - tempMargin), Math.min(T_MAX, maxTemp + tempMargin * 2)],
      y: [0, maxHum + humMargin],
    });
  }, [pairValid, temp, dewPoint]);

  // Puls: kontinuerlig så længe trinnet er aktivt, med oprydning — ingen løse timere
  useEffect(() => {
    if (!showExplanation || animationStep === 0) return;
    setPulseOpacity(1);
    const id = setInterval(() => {
      setPulseOpacity((o) => (o === 1 ? 0.35 : 1));
    }, 600);
    return () => clearInterval(id);
  }, [showExplanation, animationStep]);

  // Bliver inputtet ugyldigt midt i en forklaring, stoppes den
  useEffect(() => {
    if (!pairValid && showExplanation) {
      setShowExplanation(false);
      setAnimationStep(0);
    }
  }, [pairValid, showExplanation]);

  const xs = useMemo(() => generateTemperatureArray(), []);
  const ys = useMemo(() => xs.map((T) => absoluteHumidity(T)), [xs]);

  const data = useMemo(() => {
    const zx0 = currentZoom.x[0];
    const zx1 = currentZoom.x[1];
    const xRange = zx1 - zx0;
    const yRange = currentZoom.y[1] - currentZoom.y[0];
    const clampX = (x) => Math.min(Math.max(x, zx0 + xRange * 0.02), zx1 - xRange * 0.02);

    const traces = [
      ...(showUnsaturated
        ? [
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
          ]
        : []),
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

    // Rød lodret streg ved lufttemperaturen (skjules under forklaringen)
    if (tempInRange && !showExplanation) {
      const maks = absoluteHumidity(temp);
      traces.push({
        x: [temp, temp],
        y: [0, maks],
        type: "scatter",
        mode: "lines",
        name: "Lufttemperatur",
        line: { color: COL.red, width: 2.5, dash: "dash" },
        showlegend: false,
        hovertemplate: `T: ${fmt1(temp)} °C<br>Maksimalt vandindhold: ${fmt1(maks)} g/m³<extra></extra>`,
      });
    }

    // Grønne dugpunktselementer (skjules under forklaringen)
    if (dewInRange && !showExplanation) {
      const faktisk = absoluteHumidity(dewPoint);
      traces.push({
        x: [dewPoint, dewPoint],
        y: [0, faktisk],
        type: "scatter",
        mode: "lines",
        name: "Dugpunkt",
        line: { color: COL.green, width: 2.5, dash: "dot" },
        showlegend: false,
        hovertemplate: `Dugpunkt: ${fmt1(dewPoint)} °C<br>Faktisk vandindhold: ${fmt1(faktisk)} g/m³<extra></extra>`,
      });

      if (pairValid) {
        // Vandret grøn streg fra dugpunktet hen til luftmassens punkt
        traces.push({
          x: [dewPoint, temp],
          y: [faktisk, faktisk],
          type: "scatter",
          mode: "lines",
          name: "Faktisk vandindhold",
          line: { color: COL.green, width: 1.5, dash: "dot" },
          showlegend: false,
          hovertemplate: `Faktisk vandindhold: ${fmt1(faktisk)} g/m³<extra></extra>`,
        });
      }

      traces.push({
        x: [dewPoint],
        y: [faktisk],
        type: "scatter",
        mode: "markers",
        name: "Dugpunktspunkt",
        marker: { color: COL.green, size: 14, line: { color: "#ffffff", width: 2 } },
        showlegend: false,
        hovertemplate: `Dugpunkt: ${fmt1(dewPoint)} °C<br>Faktisk vandindhold: ${fmt1(faktisk)} g/m³<extra></extra>`,
      });

      traces.push({
        x: [clampX(dewPoint)],
        y: [faktisk + yRange * 0.05],
        type: "scatter",
        mode: "text",
        text: ["Dugpunkt"],
        textposition: "top center",
        name: "Dugpunkt tekst",
        textfont: { color: COL.greenText, size: 14, family: "Arial, sans-serif" },
        showlegend: false,
        hoverinfo: "skip",
      });
    }

    // Sort punkt: luftmassens tilstand (kun ved gyldigt par)
    if (pairValid && intersection) {
      traces.push({
        x: [temp],
        y: [intersection.faktisk],
        type: "scatter",
        mode: "markers",
        name: "Luftens tilstand",
        marker: { color: COL.dark, size: 14, line: { color: "#ffffff", width: 2 } },
        showlegend: false,
        hovertemplate:
          `Luftens tilstand<br>T: ${fmt1(temp)} °C · Dugpunkt: ${fmt1(dewPoint)} °C<br>` +
          `Faktisk vandindhold: ${fmt1(intersection.faktiskD)} g/m³<br>` +
          `Relativ luftfugtighed: ${fmt1(intersection.rhD)} %<extra></extra>`,
      });
    }

    // Forklaringens tre trin
    if (pairValid && intersection && showExplanation) {
      const { maks, faktisk, maksD, faktiskD, rhD } = intersection;
      const textX = zx0 + xRange * 0.02;

      // Trin 1: maksimalt vandindhold ved lufttemperaturen (rød, solid)
      if (animationStep >= 1) {
        traces.push({
          x: [temp, temp],
          y: [0, maks],
          type: "scatter",
          mode: "lines",
          name: "Maksimalt vandindhold",
          line: { color: COL.red, width: 6, dash: "solid" },
          opacity: animationStep === 1 ? pulseOpacity : 0.7,
          showlegend: false,
          hovertemplate: `Maksimalt vandindhold: ${fmt1(maksD)} g/m³<extra></extra>`,
        });

        if (animationStep === 1) {
          traces.push({
            x: [textX],
            y: [maks - yRange * 0.04],
            type: "scatter",
            mode: "text",
            text: [`Maksimalt vandindhold: ${fmt1(maksD)} g/m³`],
            textposition: "middle right",
            textfont: { color: COL.redText, size: 16, family: "Arial, sans-serif" },
            showlegend: false,
            hoverinfo: "skip",
          });
          // Aflæsningsstreg hen til y-aksen (grafens aktuelle venstre kant)
          traces.push({
            x: [temp, zx0],
            y: [maks, maks],
            type: "scatter",
            mode: "lines",
            line: { color: COL.red, width: 3, dash: "dot" },
            opacity: pulseOpacity,
            showlegend: false,
            hoverinfo: "skip",
          });
        }
      }

      // Trin 2: faktisk vandindhold (grøn, stiplet — kan skelnes fra rød uden farvesyn)
      if (animationStep >= 2) {
        traces.push({
          x: [temp, temp],
          y: [0, faktisk],
          type: "scatter",
          mode: "lines",
          name: "Faktisk vandindhold",
          line: { color: COL.green, width: 6, dash: "dash" },
          opacity: animationStep === 2 ? pulseOpacity : 0.7,
          showlegend: false,
          hovertemplate: `Faktisk vandindhold: ${fmt1(faktiskD)} g/m³<extra></extra>`,
        });

        if (animationStep === 2) {
          traces.push({
            x: [dewPoint],
            y: [faktisk],
            type: "scatter",
            mode: "markers",
            marker: { color: COL.green, size: 20, line: { color: "#ffffff", width: 3 }, opacity: pulseOpacity },
            showlegend: false,
            hovertemplate: `Dugpunkt: ${fmt1(dewPoint)} °C<br>Faktisk vandindhold: ${fmt1(faktiskD)} g/m³<extra></extra>`,
          });
          traces.push({
            x: [textX],
            y: [faktisk - yRange * 0.04],
            type: "scatter",
            mode: "text",
            text: [`Faktisk vandindhold: ${fmt1(faktiskD)} g/m³`],
            textposition: "middle right",
            textfont: { color: COL.greenText, size: 16, family: "Arial, sans-serif" },
            showlegend: false,
            hoverinfo: "skip",
          });
          traces.push({
            x: [temp, zx0],
            y: [faktisk, faktisk],
            type: "scatter",
            mode: "lines",
            line: { color: COL.green, width: 3, dash: "dot" },
            opacity: pulseOpacity,
            showlegend: false,
            hoverinfo: "skip",
          });
        }
      }

      // Trin 3: beregningen — samme afrundede tal som resultatkortet, så alt stemmer
      if (animationStep === 3) {
        traces.push({
          x: [textX],
          y: [maks / 2],
          type: "scatter",
          mode: "text",
          text: [`RH = ${fmt1(faktiskD)} g/m³ / ${fmt1(maksD)} g/m³ = ${fmt1(rhD)} %`],
          textposition: "middle right",
          textfont: { color: COL.purple, size: 16, family: "Arial, sans-serif" },
          showlegend: false,
          hoverinfo: "skip",
        });
        traces.push({
          x: [dewPoint],
          y: [faktisk],
          type: "scatter",
          mode: "markers",
          marker: { color: COL.green, size: 25, line: { color: "#ffffff", width: 4 }, opacity: pulseOpacity },
          showlegend: false,
          hovertemplate: `Faktisk vandindhold: ${fmt1(faktiskD)} g/m³<extra></extra>`,
        });
        traces.push({
          x: [clampX(dewPoint - xRange * 0.1)],
          y: [faktisk],
          type: "scatter",
          mode: "text",
          text: [`${fmt1(faktiskD)} g/m³`],
          textposition: "middle left",
          textfont: { color: COL.greenText, size: 14, family: "Arial, sans-serif" },
          showlegend: false,
          hoverinfo: "skip",
        });
        traces.push({
          x: [temp],
          y: [maks],
          type: "scatter",
          mode: "markers",
          marker: { color: COL.red, size: 25, line: { color: "#ffffff", width: 4 }, opacity: pulseOpacity },
          showlegend: false,
          hovertemplate: `Maksimalt vandindhold: ${fmt1(maksD)} g/m³<extra></extra>`,
        });
        traces.push({
          x: [clampX(temp - xRange * 0.1)],
          y: [maks],
          type: "scatter",
          mode: "text",
          text: [`${fmt1(maksD)} g/m³`],
          textposition: "middle left",
          textfont: { color: COL.redText, size: 14, family: "Arial, sans-serif" },
          showlegend: false,
          hoverinfo: "skip",
        });
      }
    }

    return traces;
  }, [
    xs,
    ys,
    temp,
    dewPoint,
    tempInRange,
    dewInRange,
    pairValid,
    intersection,
    showExplanation,
    animationStep,
    pulseOpacity,
    showUnsaturated,
    currentZoom,
  ]);

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
    separators: ",.", // dansk komma i alle Plotly-formaterede tal
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
      filename: "luftens_maetningskurve",
      height: 800,
      width: 1200,
      scale: 2,
    },
  };

  const resetAndClear = () => {
    setInputTemp("");
    setInputDewPoint("");
    setShowExplanation(false);
    setAnimationStep(0);
    applyZoom(DEFAULT_ZOOM);
    setPlotKey((k) => k + 1);
  };

  const startExplanation = () => {
    setShowExplanation(true);
    setAnimationStep(1);
  };
  const stopExplanation = () => {
    setShowExplanation(false);
    setAnimationStep(0);
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
      {/* Graf — øverst på mobil, til højre på desktop */}
      <div className="flex-1 order-1 lg:order-2">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <Plot
            key={plotKey}
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
      </div>

      {/* Kontrolpanel */}
      <div className="lg:w-80 flex-shrink-0 order-2 lg:order-1 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <p className="text-sm text-gray-500 font-light mb-5">
            Mætningskurven viser den maksimale mængde vanddamp (g/m³) som luften
            kan indeholde ved forskellige temperaturer.
          </p>

          {intersection && showExplanation && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center mb-2">
                <h4 className="font-semibold text-amber-800 text-sm">Forklaring</h4>
                <span
                  className={`font-medium text-sm ml-2 ${
                    animationStep === 1
                      ? "text-red-700"
                      : animationStep === 2
                      ? "text-emerald-700"
                      : "text-purple-700"
                  }`}
                >
                  {animationStep === 1 && "1 · Maksimalt vandindhold"}
                  {animationStep === 2 && "2 · Faktisk vandindhold"}
                  {animationStep === 3 && "3 · Beregning"}
                </span>
              </div>
              <div className="flex space-x-1 mb-3">
                <div className={`h-1 flex-1 rounded ${animationStep >= 1 ? "bg-red-500" : "bg-gray-200"}`}></div>
                <div className={`h-1 flex-1 rounded ${animationStep >= 2 ? "bg-emerald-500" : "bg-gray-200"}`}></div>
                <div className={`h-1 flex-1 rounded ${animationStep >= 3 ? "bg-purple-500" : "bg-gray-200"}`}></div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setAnimationStep((s) => Math.max(1, s - 1))}
                  disabled={animationStep <= 1}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    animationStep <= 1
                      ? "border-gray-200 text-gray-300 cursor-not-allowed"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  ← Forrige
                </button>
                <button
                  onClick={() => setAnimationStep((s) => Math.min(3, s + 1))}
                  disabled={animationStep >= 3}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    animationStep >= 3
                      ? "border-gray-200 text-gray-300 cursor-not-allowed"
                      : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  Næste →
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="input-temp" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: COL.red }} aria-hidden="true"></span>
                Temperatur (°C)
              </label>
              <input
                id="input-temp"
                type="text"
                inputMode="decimal"
                value={inputTemp}
                onChange={handleInput(setInputTemp)}
                placeholder={`${T_MIN} til ${T_MAX} °C`}
                aria-describedby="temp-help temp-error"
                className={`w-full px-3 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  tempError || pairError ? "border-red-400 bg-red-50" : "border-gray-300"
                }`}
              />
              {tempError && (
                <p id="temp-error" role="alert" className="text-xs text-red-700 mt-1">
                  {tempError}
                </p>
              )}
              <p id="temp-help" className="text-xs text-gray-500 mt-1">
                Rød stiplet streg tegnes fra x-aksen op til kurven
              </p>
            </div>

            <div>
              <label htmlFor="input-dew" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: COL.green }} aria-hidden="true"></span>
                Dugpunktstemperatur (°C)
              </label>
              <input
                id="input-dew"
                type="text"
                inputMode="decimal"
                value={inputDewPoint}
                onChange={handleInput(setInputDewPoint)}
                placeholder={`${T_MIN} til ${T_MAX} °C`}
                aria-describedby="dew-help dew-error"
                className={`w-full px-3 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  dewRangeError || pairError ? "border-red-400 bg-red-50" : "border-gray-300"
                }`}
              />
              {(dewRangeError || pairError) && (
                <p id="dew-error" role="alert" className="text-xs text-red-700 mt-1">
                  {dewRangeError || pairError}
                </p>
              )}
              <p id="dew-help" className="text-xs text-gray-500 mt-1">
                Grøn prikket streg tegnes op til kurven — sammen med temperaturen
                vises luftmassens punkt
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <button
              onClick={() => setShowUnsaturated(!showUnsaturated)}
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {showUnsaturated ? "Skjul umættet område" : "Vis umættet område"}
            </button>

            {intersection && (
              <button
                onClick={showExplanation ? stopExplanation : startExplanation}
                className={`w-full px-3 py-2 rounded-xl border text-sm transition-colors ${
                  showExplanation
                    ? "border-orange-300 text-orange-700 hover:bg-orange-50"
                    : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                {showExplanation ? "Stop forklaring" : "Forklar beregningen"}
              </button>
            )}

            <button
              onClick={resetAndClear}
              className="w-full px-3 py-1.5 text-sm text-gray-400 hover:text-red-600 transition-colors"
            >
              Ryd og nulstil
            </button>
          </div>
        </div>

        {/* Resultatkort — RH er helten */}
        {intersection && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">
              Relativ luftfugtighed
            </p>
            <p className="text-4xl font-light mb-4" style={{ color: COL.purple }}>
              {fmt1(intersection.rhD)} %
            </p>

            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-gray-600">
                  <span className="w-2 h-2 rounded-full" style={{ background: COL.red }}></span>
                  Lufttemperatur
                </dt>
                <dd className="font-medium text-gray-900">{fmt1(temp)} °C</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-gray-600">
                  <span className="w-2 h-2 rounded-full" style={{ background: COL.green }}></span>
                  Dugpunkt
                </dt>
                <dd className="font-medium text-gray-900">{fmt1(dewPoint)} °C</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-gray-600">
                  <span className="w-2 h-2 rounded-full" style={{ background: COL.green }}></span>
                  Faktisk vandindhold
                </dt>
                <dd className="font-medium text-gray-900">{fmt1(intersection.faktiskD)} g/m³</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-gray-600">
                  <span className="w-2 h-2 rounded-full" style={{ background: COL.red }}></span>
                  Maksimalt vandindhold
                </dt>
                <dd className="font-medium text-gray-900">{fmt1(intersection.maksD)} g/m³</dd>
              </div>
            </dl>

            <div className="mt-4 p-3 bg-gray-50 rounded-xl text-sm space-y-1">
              <p>
                <InlineMath math="\text{RH} = \frac{\text{faktisk indhold}}{\text{maksimalt indhold}}" />
              </p>
              <p>
                <InlineMath
                  math={`\\text{RH} = \\frac{\\textcolor{#047857}{\\text{${fmt1(
                    intersection.faktiskD
                  )} g/m³}}}{\\textcolor{#b91c1c}{\\text{${fmt1(intersection.maksD)} g/m³}}}`}
                />
              </p>
              <p>
                <InlineMath math={`\\text{RH} = \\text{${fmt1(intersection.rhD)} \\%}`} />
              </p>
            </div>
          </div>
        )}

        {pairError && !intersection && (
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4" role="alert">
            <p className="text-sm text-amber-900">
              <strong>Ugyldig kombination:</strong> {pairError} Ved mætning er
              dugpunktet lig med lufttemperaturen (RH = 100 %).
            </p>
          </div>
        )}

        <p className="text-xs text-gray-400 font-light px-1">
          Magnus-formlen (Sonntag90): Ew = α·exp((β·T)/(λ+T)) hvor α=6,112 hPa,
          β=17,62, λ=243,12 °C. RH beregnes som forholdet mellem absolut
          luftfugtighed ved dugpunktet og ved lufttemperaturen (g/m³);
          meteorologiens damptryksdefinition giver op til ca. 2 procentpoint
          lavere værdier. Under 0 °C gælder kurven (underafkølet) vand — mætning
          over is ligger lavere.
        </p>
      </div>
    </div>
  );
}
