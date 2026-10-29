import React, { useEffect, useMemo, useRef, useState } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-basic-dist";
import "katex/dist/katex.min.css";
import { InlineMath } from "react-katex";

const Plot = createPlotlyComponent(Plotly);

// ---------------------------------------------------------------------------
// Fysik — Magnus-formlen med Sonntag90-konstanter, gyldig -45..60 °C over vand.
// Under 0 °C gælder kurven (underafkølet) vand, ikke is — standard i meteorologi.
// ---------------------------------------------------------------------------
const ALPHA = 6.112; // hPa
const BETA = 17.62;
const LAMBDA = 243.12; // °C
const T_MIN = -45;
const T_MAX = 60;

function saturationVaporPressure(T) {
  // Ew = α · exp((β·T)/(λ+T))
  return ALPHA * Math.exp((BETA * T) / (LAMBDA + T));
}

function absoluteHumidity(T) {
  // Idealgas: ρ = e·Mw / (R·Tk), e i Pa, Mw = 18.015 g/mol, R = 8.314 J/(mol·K)
  const e = saturationVaporPressure(T) * 100;
  return (e * 18.015) / (8.314 * (T + 273.15));
}

// ---------------------------------------------------------------------------
// Formatering — én decimal med dansk komma, og alle viste beregninger laves af
// de viste (afrundede) tal, så eleven altid kan reproducere regnestykket.
// ---------------------------------------------------------------------------
const round1 = (x) => Math.round(x * 10) / 10;
const fmt1 = (x) => round1(x).toFixed(1).replace(".", ",");
const parseDa = (s) => parseFloat(String(s).replace(",", "."));
const INPUT_RE = /^-?\d*[.,]?\d*$/; // tillader at skrive værdien færdig, komma eller punktum

const DEFAULT_ZOOM = { x: [-10, 40], y: [0, 50] };

// Farvesystem: rød = lufttemperatur/maksimalt indhold, grøn = dugpunkt/faktisk
// indhold, mørkeblå = mætningskurve, lilla = relativ luftfugtighed.
// Tekstfarverne er mørkere varianter af hensyn til kontrast (WCAG).
const COL = {
  curve: "#1e40af",
  fill: "rgba(59, 130, 246, 0.08)",
  red: "#ef4444",
  redText: "#b91c1c",
  green: "#10b981",
  greenText: "#047857",
  dark: "#1f2937",
  purple: "#7c3aed",
};

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

  const xs = useMemo(() => {
    const arr = [];
    for (let t = T_MIN; t <= T_MAX + 1e-9; t += 0.25) arr.push(parseFloat(t.toFixed(6)));
    return arr;
  }, []);
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

      // Trin 3: beregningen — samme afrundede tal som boksen, så alt stemmer
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
      gridcolor: "#e5e7eb",
      zerolinecolor: "#d1d5db",
      showline: true,
      linecolor: "#d1d5db",
      tickfont: { size: 12, color: "#6b7280" },
    },
    yaxis: {
      title: { text: "Absolut luftfugtighed (g vanddamp/m³)", font: { size: 14, color: "#374151" } },
      rangemode: "tozero",
      range: currentZoom.y,
      gridcolor: "#e5e7eb",
      zerolinecolor: "#d1d5db",
      showline: true,
      linecolor: "#d1d5db",
      tickfont: { size: 12, color: "#6b7280" },
    },
    separators: ",.", // dansk komma i alle Plotly-formaterede tal (hover og aksetal)
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
      bordercolor: "#d1d5db",
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
    <div className="min-h-screen bg-white text-slate-800">
      <div className="max-w-7xl mx-auto p-4">
        <h1 className="text-2xl font-semibold mb-4">Luftens mætningskurve</h1>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Graf — øverst på mobil, til højre på desktop */}
          <div className="flex-1 order-1 lg:order-2">
            <div className="rounded-xl border">
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
          <div className="lg:w-80 flex-shrink-0 order-2 lg:order-1">
            <div className="p-4 border rounded-xl bg-gray-50 h-fit">
              <p className="text-sm text-slate-600 mb-4">
                Mætningskurven viser den maksimale mængde vanddamp (g/m³) som
                luften kan indeholde ved forskellige temperaturer.
              </p>

              {intersection && showExplanation && (
                <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center mb-2">
                    <h4 className="font-semibold text-yellow-800 text-base">Forklaring:</h4>
                    <span
                      className={`font-semibold text-sm ml-2 ${
                        animationStep === 1
                          ? "text-red-700"
                          : animationStep === 2
                          ? "text-emerald-700"
                          : "text-purple-700"
                      }`}
                    >
                      {animationStep === 1 && "Trin 1: Maksimalt vandindhold"}
                      {animationStep === 2 && "Trin 2: Faktisk vandindhold"}
                      {animationStep === 3 && "Trin 3: Beregning"}
                    </span>
                  </div>
                  <div className="flex space-x-1 mb-2">
                    <div className={`h-1.5 flex-1 rounded ${animationStep >= 1 ? "bg-red-500" : "bg-gray-200"}`}></div>
                    <div className={`h-1.5 flex-1 rounded ${animationStep >= 2 ? "bg-emerald-500" : "bg-gray-200"}`}></div>
                    <div className={`h-1.5 flex-1 rounded ${animationStep >= 3 ? "bg-purple-500" : "bg-gray-200"}`}></div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setAnimationStep((s) => Math.max(1, s - 1))}
                      disabled={animationStep <= 1}
                      className={`px-2 py-1 text-xs rounded ${
                        animationStep <= 1
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                      }`}
                    >
                      ← Forrige
                    </button>
                    <button
                      onClick={() => setAnimationStep((s) => Math.min(3, s + 1))}
                      disabled={animationStep >= 3}
                      className={`px-2 py-1 text-xs rounded ${
                        animationStep >= 3
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      }`}
                    >
                      Næste →
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-4 mb-4">
                <div>
                  <label htmlFor="input-temp" className="block text-sm font-medium text-gray-700 mb-2">
                    Temperatur (°C)
                  </label>
                  <input
                    id="input-temp"
                    type="text"
                    inputMode="decimal"
                    value={inputTemp}
                    onChange={handleInput(setInputTemp)}
                    placeholder={`Indtast temperatur (${T_MIN} til ${T_MAX} °C)`}
                    aria-describedby="temp-help temp-error"
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      tempError || pairError ? "border-red-500 bg-red-50" : "border-gray-300"
                    }`}
                  />
                  {tempError && (
                    <p id="temp-error" role="alert" className="text-xs text-red-700 mt-1">
                      {tempError}
                    </p>
                  )}
                  <p id="temp-help" className="text-xs text-gray-600 mt-1">
                    Rød stiplet streg tegnes fra x-aksen op til kurven
                  </p>
                </div>

                <div>
                  <label htmlFor="input-dew" className="block text-sm font-medium text-gray-700 mb-2">
                    Dugpunktstemperatur (°C)
                  </label>
                  <input
                    id="input-dew"
                    type="text"
                    inputMode="decimal"
                    value={inputDewPoint}
                    onChange={handleInput(setInputDewPoint)}
                    placeholder={`Indtast dugpunkt (${T_MIN} til ${T_MAX} °C)`}
                    aria-describedby="dew-help dew-error"
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      dewRangeError || pairError ? "border-red-500 bg-red-50" : "border-gray-300"
                    }`}
                  />
                  {(dewRangeError || pairError) && (
                    <p id="dew-error" role="alert" className="text-xs text-red-700 mt-1">
                      {dewRangeError || pairError}
                    </p>
                  )}
                  <p id="dew-help" className="text-xs text-gray-600 mt-1">
                    Grøn prikket streg tegnes op til kurven — sammen med
                    temperaturen vises luftmassens punkt
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => setShowUnsaturated(!showUnsaturated)}
                  className={`w-full px-3 py-2 border rounded-lg ${
                    showUnsaturated
                      ? "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300"
                      : "bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-300"
                  }`}
                >
                  {showUnsaturated ? "Skjul umættet" : "Vis umættet"}
                </button>

                {intersection && (
                  <button
                    onClick={showExplanation ? stopExplanation : startExplanation}
                    className={`w-full px-3 py-2 border rounded-lg ${
                      showExplanation
                        ? "bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-300"
                        : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300"
                    }`}
                  >
                    {showExplanation ? "Stop forklaring" : "Forklar beregningen"}
                  </button>
                )}

                <button
                  onClick={resetAndClear}
                  className="w-full px-3 py-2 border rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border-red-300"
                >
                  Ryd og nulstil
                </button>
              </div>

              {intersection && (
                <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <h3 className="font-semibold text-blue-800 mb-1 text-sm">
                    Beregning af relativ luftfugtighed
                  </h3>

                  <div className="space-y-1 text-xs">
                    <p>
                      <strong style={{ color: COL.redText }}>Lufttemperatur:</strong>{" "}
                      {fmt1(temp)} °C
                    </p>
                    <p>
                      <strong style={{ color: COL.greenText }}>Dugpunktstemperatur:</strong>{" "}
                      {fmt1(dewPoint)} °C
                    </p>
                    <p>
                      <strong style={{ color: COL.greenText }}>Faktisk vandindhold:</strong>{" "}
                      {fmt1(intersection.faktiskD)} g/m³
                    </p>
                    <p>
                      <strong style={{ color: COL.redText }}>Maksimalt vandindhold:</strong>{" "}
                      {fmt1(intersection.maksD)} g/m³
                    </p>
                    <p>
                      <strong style={{ color: COL.purple }}>Relativ luftfugtighed:</strong>{" "}
                      {fmt1(intersection.rhD)} %
                    </p>
                  </div>

                  <div className="mt-2 p-1 bg-white border rounded text-xs">
                    <div className="space-y-1">
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
                </div>
              )}

              {pairError && !intersection && (
                <div className="mt-3 p-2 bg-yellow-50 border border-yellow-300 rounded-lg" role="alert">
                  <p className="text-xs text-yellow-900">
                    <strong>Ugyldig kombination:</strong> {pairError} Ved mætning
                    er dugpunktet lig med lufttemperaturen (RH = 100 %).
                  </p>
                </div>
              )}

              <p className="mt-4 text-xs text-slate-500">
                Magnus-formlen (Sonntag90): Ew = α·exp((β·T)/(λ+T)) hvor α=6,112
                hPa, β=17,62, λ=243,12 °C. RH beregnes som forholdet mellem
                absolut luftfugtighed ved dugpunktet og ved lufttemperaturen
                (g/m³); meteorologiens damptryksdefinition giver op til ca. 2
                procentpoint lavere værdier. Under 0 °C gælder kurven
                (underafkølet) vand — mætning over is ligger lavere.
              </p>
              <p className="mt-2 text-xs text-slate-400 text-center">Philip K. Jakobsen</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
