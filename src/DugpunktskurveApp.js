import React, { useMemo, useState, useEffect } from "react";
import Plot from "react-plotly.js";
import "katex/dist/katex.min.css";
import { InlineMath, BlockMath } from "react-katex";

// Simpel interaktiv dugpunktskurve
// - Én kurve styret af en RH-slider
// - Zoom/pan for at ændre akserne (dobbeltklik for reset)
export default function DugpunktskurveApp() {
  const [plotKey, setPlotKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [inputTemp, setInputTemp] = useState("");
  const [inputDewPoint, setInputDewPoint] = useState("");
  const [intersectionPoint, setIntersectionPoint] = useState(null);
  const [currentZoom, setCurrentZoom] = useState({ x: [-10, 40], y: [0, 50] });
  const [showExplanation, setShowExplanation] = useState(false);
  const [animationStep, setAnimationStep] = useState(0);
  const [pulseOpacity, setPulseOpacity] = useState(0);

  // Tjek og juster zoom når input-værdier ændres
  useEffect(() => {
    if (
      inputTemp &&
      inputDewPoint &&
      !isNaN(parseFloat(inputTemp)) &&
      !isNaN(parseFloat(inputDewPoint))
    ) {
      const temp = parseFloat(inputTemp);
      const dewPoint = parseFloat(inputDewPoint);

      if (temp >= -45 && temp <= 60 && dewPoint >= -45 && dewPoint <= 60) {
        checkAndAdjustZoom(temp, dewPoint);
      }
    }
  }, [inputTemp, inputDewPoint]);

  // Magnus formel parametre fra Sonntag90
  const alpha = 6.112; // hPa
  const beta = 17.62;
  const lambda = 243.12; // °C

  function saturationVaporPressure(T) {
    // Magnus formel for mætningsdampstryk
    // Ew = α * exp((β*T)/(λ+T))
    return alpha * Math.exp((beta * T) / (lambda + T));
  }

  function absoluteHumidity(T) {
    // Konverter mætningsdampstryk til absolut luftfugtighed (g/m³)
    // ρ = (e * Mw) / (R * Tk)
    // hvor e = dampstryk (Pa), Mw = molær masse vand (18.015 g/mol)
    // R = universel gaskonstant (8.314 J/(mol·K)), Tk = temperatur i Kelvin
    const e = saturationVaporPressure(T) * 100; // Konverter hPa til Pa
    const Mw = 18.015; // g/mol
    const R = 8.314; // J/(mol·K)
    const Tk = T + 273.15; // Konverter °C til Kelvin

    return (e * Mw) / (R * Tk);
  }

  function dewPointC(T, RH) {
    // Magnus formel for dugpunkt beregning
    // Dp(T,RH) = λ * (ln(RH/100) + (β*T)/(λ+T)) / (β - (ln(RH/100) + (β*T)/(λ+T)))
    const gamma = Math.log(RH / 100) + (beta * T) / (lambda + T);
    return (lambda * gamma) / (beta - gamma);
  }

  function relativeHumidity(T, Td) {
    // Beregn relativ luftfugtighed fra temperatur og dugpunkt
    // RH = 100 * exp((β*Td)/(λ+Td) - (β*T)/(λ+T))
    const numerator = (beta * Td) / (lambda + Td);
    const denominator = (beta * T) / (lambda + T);
    return 100 * Math.exp(numerator - denominator);
  }

  const xs = useMemo(() => {
    const arr = [];
    for (let t = -45; t <= 60 + 1e-9; t += 0.25)
      arr.push(parseFloat(t.toFixed(6)));
    return arr;
  }, []);

  const ys = useMemo(() => xs.map((T) => absoluteHumidity(T)), [xs]);

  const data = useMemo(() => {
    const traces = [
      {
        x: xs,
        y: ys,
        type: "scatter",
        mode: "lines",
        name: "Mætningskurve",
        line: {
          width: 3,
          color: "#3b82f6",
          shape: "spline",
        },
        hovertemplate: `T: %{x:.2f} °C<br>Luftfugtighed: %{y:.2f} g/m³<extra></extra>`,
      },
    ];

    // Rød vertikal streg fra temperatur input
    if (inputTemp && !isNaN(parseFloat(inputTemp))) {
      const temp = parseFloat(inputTemp);
      if (temp >= -45 && temp <= 60) {
        const humidity = absoluteHumidity(temp);
        traces.push({
          x: [temp, temp],
          y: [0, humidity],
          type: "scatter",
          mode: "lines",
          name: "Temperatur streg",
          line: {
            color: "#ef4444",
            width: 2.5,
            dash: "dash",
            shape: "linear",
          },
          showlegend: false,
          hovertemplate: `T: ${temp} °C<br>Luftfugtighed: ${humidity.toFixed(
            2
          )} g/m³<extra></extra>`,
        });
      }
    }

    // Grøn streg fra dugpunkt input - først lodret op til kurven, så vandret til højre
    if (inputDewPoint && !isNaN(parseFloat(inputDewPoint))) {
      const dewPoint = parseFloat(inputDewPoint);
      if (dewPoint >= -45 && dewPoint <= 60) {
        const humidity = absoluteHumidity(dewPoint);
        traces.push({
          x: [dewPoint, dewPoint, 60], // Fra dugpunkt lodret op, så vandret til højre
          y: [0, humidity, humidity], // Fra x-akse til kurven, så vandret
          type: "scatter",
          mode: "lines",
          name: "Dugpunkt streg",
          line: {
            color: "#10b981",
            width: 2.5,
            dash: "dot",
            shape: "linear",
          },
          showlegend: true,
          legendgroup: "dugpunkt",
          hovertemplate: `Dugpunkt: ${dewPoint} °C<br>Luftfugtighed: ${humidity.toFixed(
            2
          )} g/m³<extra></extra>`,
        });
      }
    }

    // Sort cirkel ved krydsningspunkt
    if (
      inputTemp &&
      inputDewPoint &&
      !isNaN(parseFloat(inputTemp)) &&
      !isNaN(parseFloat(inputDewPoint))
    ) {
      const temp = parseFloat(inputTemp);
      const dewPoint = parseFloat(inputDewPoint);

      // Kun vis krydsningspunkt hvis begge værdier er inden for gyldigt område
      if (temp >= -45 && temp <= 60 && dewPoint >= -45 && dewPoint <= 60) {
        const tempHumidity = absoluteHumidity(temp);
        const dewPointHumidity = absoluteHumidity(dewPoint);

        // Find krydsningspunkt mellem de to streger
        const intersectionX = temp; // Rød streg er vertikal ved temperatur
        const intersectionY = dewPointHumidity; // Grøn streg er horisontal ved dugpunktets luftfugtighed

        // Beregn RH som forholdet mellem faktisk og maksimalt vandindhold
        const rh = (dewPointHumidity / tempHumidity) * 100;
        setIntersectionPoint({
          temperature: temp,
          dewPoint: dewPoint,
          humidity: dewPointHumidity,
          relativeHumidity: rh,
        });

        traces.push({
          x: [intersectionX],
          y: [intersectionY],
          type: "scatter",
          mode: "markers",
          name: "Krydsningspunkt",
          marker: {
            color: "#1f2937",
            size: 14,
            line: {
              color: "#ffffff",
              width: 2,
            },
          },
          showlegend: false,
          hovertemplate: `Krydsningspunkt<br>T: ${temp} °C<br>Dugpunkt: ${dewPoint} °C<br>Luftfugtighed: ${dewPointHumidity.toFixed(
            2
          )} g/m³<br>RH: ${rh.toFixed(1)}%<extra></extra>`,
        });

        // Pædagogiske forklaringslinjer med pulserende effekt
        if (showExplanation) {
          console.log(
            "showExplanation:",
            showExplanation,
            "animationStep:",
            animationStep,
            "pulseOpacity:",
            pulseOpacity
          );
          // Trin 1: Vis maksimalt vandindhold ved lufttemperaturen
          if (animationStep >= 1) {
            traces.push({
              x: [temp, temp],
              y: [0, tempHumidity],
              type: "scatter",
              mode: "lines",
              name: "Maksimalt vandindhold",
              line: {
                color: "#dc2626",
                width: 6,
                dash: "solid",
              },
              opacity: animationStep === 1 ? pulseOpacity : 0.7,
              showlegend: false,
              hovertemplate: `Maksimalt vandindhold: ${tempHumidity
                .toFixed(1)
                .replace(".", ",")} g/m³<extra></extra>`,
            });

            // Værdi og begreb ved dugpunktkurven (placeret til venstre for kurven)
            if (animationStep === 1) {
              traces.push({
                x: [temp - 8], // Placeret 8°C til venstre for temperaturen
                y: [tempHumidity],
                type: "scatter",
                mode: "text",
                text: [
                  `Maksimalt vandindhold: ${tempHumidity
                    .toFixed(1)
                    .replace(".", ",")} g/m³`,
                ],
                textposition: "middle right", // Tekst justeret til højre af punktet
                name: "Maksimalt vandindhold værdi",
                textfont: {
                  color: "#dc2626",
                  size: 16,
                  family: "Arial, sans-serif",
                },
                showlegend: false,
                hovertemplate: `Maksimalt vandindhold: ${tempHumidity
                  .toFixed(1)
                  .replace(".", ",")} g/m³<extra></extra>`,
              });

              // Blinkende streg til y-aksen
              traces.push({
                x: [temp, -10],
                y: [tempHumidity, tempHumidity],
                type: "scatter",
                mode: "lines",
                name: "Blinkende streg til y-akse",
                line: {
                  color: "#dc2626",
                  width: 3,
                  dash: "dot",
                },
                opacity: pulseOpacity,
                showlegend: false,
                hovertemplate: `Maksimalt vandindhold: ${tempHumidity
                  .toFixed(1)
                  .replace(".", ",")} g/m³<extra></extra>`,
              });
            }
          }

          // Trin 2: Vis faktisk vandindhold og dugpunkt
          if (animationStep >= 2) {
            // Grøn linje op til den sorte cirkel
            traces.push({
              x: [temp, temp],
              y: [0, dewPointHumidity],
              type: "scatter",
              mode: "lines",
              name: "Faktisk vandindhold",
              line: {
                color: "#10b981",
                width: 6,
                dash: "solid",
              },
              opacity: animationStep === 2 ? pulseOpacity : 0.7,
              showlegend: false,
              hovertemplate: `Faktisk vandindhold: ${dewPointHumidity
                .toFixed(1)
                .replace(".", ",")} g/m³<extra></extra>`,
            });

            // Grøn prik ved dugpunktet
            if (animationStep === 2) {
              traces.push({
                x: [dewPoint],
                y: [dewPointHumidity],
                type: "scatter",
                mode: "markers",
                name: "Dugpunkt",
                marker: {
                  color: "#10b981",
                  size: 20,
                  line: { color: "#ffffff", width: 3 },
                  opacity: pulseOpacity,
                },
                showlegend: false,
                hovertemplate: `Dugpunkt: ${dewPoint} °C<br>Luftfugtighed: ${dewPointHumidity
                  .toFixed(1)
                  .replace(".", ",")} g/m³<extra></extra>`,
              });
            }

            // Værdi og begreb ved krydset (placeret til venstre for kurven)
            if (animationStep === 2) {
              traces.push({
                x: [temp - 8], // Placeret 8°C til venstre for temperaturen
                y: [dewPointHumidity],
                type: "scatter",
                mode: "text",
                text: [
                  `Faktisk vandindhold: ${dewPointHumidity
                    .toFixed(1)
                    .replace(".", ",")} g/m³`,
                ],
                textposition: "middle right", // Tekst justeret til højre af punktet
                name: "Faktisk vandindhold værdi",
                textfont: {
                  color: "#10b981",
                  size: 16,
                  family: "Arial, sans-serif",
                },
                showlegend: false,
                hovertemplate: `Faktisk vandindhold: ${dewPointHumidity
                  .toFixed(1)
                  .replace(".", ",")} g/m³<extra></extra>`,
              });

              // Blinkende streg til y-aksen
              traces.push({
                x: [temp, -10],
                y: [dewPointHumidity, dewPointHumidity],
                type: "scatter",
                mode: "lines",
                name: "Blinkende streg til y-akse",
                line: {
                  color: "#10b981",
                  width: 3,
                  dash: "dot",
                },
                opacity: pulseOpacity,
                showlegend: false,
                hovertemplate: `Faktisk vandindhold: ${dewPointHumidity
                  .toFixed(1)
                  .replace(".", ",")} g/m³<extra></extra>`,
              });
            }
          }

          // Trin 3: Vis beregning og resultat
          if (animationStep >= 3) {
            // Beregningsformel ved kurven i trin 3
            if (animationStep === 3) {
                          // Placér formlen længere til venstre, fri af kurven
            const formelX = Math.min(dewPoint, temp) - 12; // 12°C til venstre for det mindste punkt
            const midY = (dewPointHumidity + tempHumidity) / 2;

              // Beregn RH som forholdet mellem faktisk og maksimalt vandindhold
              const calculatedRH = (dewPointHumidity / tempHumidity) * 100;

              traces.push({
                x: [formelX],
                y: [midY],
                type: "scatter",
                mode: "text",
                text: [
                  `RH = ${dewPointHumidity
                    .toFixed(1)
                    .replace(".", ",")} g/m³ / ${tempHumidity
                    .toFixed(1)
                    .replace(".", ",")} g/m³ = ${calculatedRH
                    .toFixed(1)
                    .replace(".", ",")}%`,
                ],
                textposition: "middle right",
                name: "Beregningsformel",
                textfont: {
                  color: "#7c3aed",
                  size: 16,
                  family: "Arial, sans-serif",
                  weight: "bold",
                },
                showlegend: false,
                hovertemplate: `Beregning: ${dewPointHumidity
                  .toFixed(1)
                  .replace(".", ",")} g/m³ / ${tempHumidity
                  .toFixed(1)
                  .replace(".", ",")} g/m³ = ${calculatedRH
                  .toFixed(1)
                  .replace(".", ",")}%<extra></extra>`,
              });
            }

            // Pulserende punkt ved dugpunkt (faktisk indhold)
            if (animationStep === 3) {
              traces.push({
                x: [dewPoint],
                y: [dewPointHumidity],
                type: "scatter",
                mode: "markers",
                name: "Faktisk indhold",
                marker: {
                  color: "#10b981",
                  size: 25,
                  line: { color: "#ffffff", width: 4 },
                  opacity: pulseOpacity,
                },
                showlegend: false,
                hovertemplate: `Faktisk indhold (ved dugpunkt): ${dewPointHumidity
                  .toFixed(1)
                  .replace(".", ",")} g/m³<extra></extra>`,
              });
            }

            // Pulserende punkt ved temperatur (maksimalt indhold)
            if (animationStep === 3) {
              traces.push({
                x: [temp],
                y: [tempHumidity],
                type: "scatter",
                mode: "markers",
                name: "Maksimalt indhold",
                marker: {
                  color: "#dc2626",
                  size: 25,
                  line: { color: "#ffffff", width: 4 },
                  opacity: pulseOpacity,
                },
                showlegend: false,
                hovertemplate: `Maksimalt indhold (ved temperatur): ${tempHumidity
                  .toFixed(1)
                  .replace(".", ",")} g/m³<extra></extra>`,
              });
            }
          }
        }
      } else {
        setIntersectionPoint(null);
      }
    } else {
      setIntersectionPoint(null);
    }

    return traces;
  }, [
    xs,
    ys,
    inputTemp,
    inputDewPoint,
    showExplanation,
    animationStep,
    pulseOpacity,
  ]);

  const layout = {
    title: {
      text: "LUFTENS MÆTNINGSKURVE",
      font: { size: 20, color: "#1f2937" },
      x: 0.5,
      xanchor: "center",
    },
    xaxis: {
      title: {
        text: "Temperatur i °C",
        font: { size: 14, color: "#374151" },
      },
      tickmode: "linear",
      dtick: 2,
      tick0: -10,
      tickangle: 0,
      range: currentZoom.x,
      gridcolor: "#e5e7eb",
      zerolinecolor: "#d1d5db",
      showline: true,
      linecolor: "#d1d5db",
      tickfont: { size: 12, color: "#6b7280" },
    },
    yaxis: {
      title: {
        text: "Luftfugtighed i g vanddamp / m³ luft",
        font: { size: 14, color: "#374151" },
      },
      tickmode: "linear",
      dtick: 2,
      tick0: 0,
      tickangle: 0,
      rangemode: "tozero",
      range: currentZoom.y,
      gridcolor: "#e5e7eb",
      zerolinecolor: "#d1d5db",
      showline: true,
      linecolor: "#d1d5db",
      tickfont: { size: 12, color: "#6b7280" },
    },
    margin: { l: 80, r: 20, t: 60, b: 50 },
    hovermode: "closest",
    dragmode: "zoom",
    autosize: true,
    height: isFullscreen ? window.innerHeight - 100 : 500,
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

  const reset = () => setPlotKey((k) => k + 1);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const checkAndAdjustZoom = (temp, dewPoint) => {
    let newZoom = { ...currentZoom };
    let needsUpdate = false;

    // Tjek om temperatur er udenfor zoom-området
    if (temp < currentZoom.x[0] || temp > currentZoom.x[1]) {
      const margin = 5; // 5°C margin
      newZoom.x[0] = Math.min(newZoom.x[0], temp - margin);
      newZoom.x[1] = Math.max(newZoom.x[1], temp + margin);
      needsUpdate = true;
    }

    // Tjek om dugpunkt er udenfor zoom-området
    if (dewPoint < currentZoom.x[0] || dewPoint > currentZoom.x[1]) {
      const margin = 5; // 5°C margin
      newZoom.x[0] = Math.min(newZoom.x[0], dewPoint - margin);
      newZoom.x[1] = Math.max(newZoom.x[1], dewPoint + margin);
      needsUpdate = true;
    }

    // Tjek om luftfugtighed er udenfor y-zoom-området
    const tempHumidity = absoluteHumidity(temp);
    const dewPointHumidity = absoluteHumidity(dewPoint);
    const maxHumidity = Math.max(tempHumidity, dewPointHumidity);

    if (maxHumidity > currentZoom.y[1]) {
      const margin = 5; // 5 g/m³ margin
      newZoom.y[1] = maxHumidity + margin;
      needsUpdate = true;
    }

    if (needsUpdate) {
      setCurrentZoom(newZoom);
      setPlotKey((k) => k + 1); // Genopret graf
    }
  };

  const startExplanationAnimation = () => {
    setShowExplanation(true);
    setAnimationStep(1);
    startPulseAnimation();
  };

  const nextAnimationStep = () => {
    if (animationStep < 3) {
      setAnimationStep(animationStep + 1);
      startPulseAnimation();
    }
  };

  const previousAnimationStep = () => {
    if (animationStep > 1) {
      setAnimationStep(animationStep - 1);
      startPulseAnimation();
    }
  };

  const startPulseAnimation = () => {
    console.log("Starting pulse animation");
    setPulseOpacity(1);
    setTimeout(() => {
      console.log("Pulse opacity: 0.3");
      setPulseOpacity(0.3);
    }, 500);
    setTimeout(() => {
      console.log("Pulse opacity: 1.0");
      setPulseOpacity(1);
    }, 1000);
    setTimeout(() => {
      console.log("Pulse opacity: 0.3");
      setPulseOpacity(0.3);
    }, 1500);
    setTimeout(() => {
      console.log("Pulse opacity: 1.0");
      setPulseOpacity(1);
    }, 2000);
  };

  const stopExplanationAnimation = () => {
    setShowExplanation(false);
    setAnimationStep(0);
    setPulseOpacity(0);
  };

  return (
    <div
      className={`${
        isFullscreen ? "fixed inset-0 z-50" : "min-h-screen"
      } bg-white text-slate-800`}
    >
      <div
        className={`${isFullscreen ? "h-full p-2" : "max-w-6xl mx-auto p-4"}`}
      >
        <h1 className="text-2xl font-semibold mb-4">LUFTENS MÆTNINGSKURVE</h1>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Venstre side - Kontrolpanel */}
          <div className="lg:w-80 flex-shrink-0">
            <div className="p-4 border rounded-xl bg-gray-50 h-fit">
              <p className="text-sm text-slate-600 mb-4">
                Mætningskurven viser den maksimale mængde vanddamp (g/m³) som
                luften kan indeholde ved forskellige temperaturer.
              </p>

              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Temperatur (°C)
                  </label>
                  <input
                    type="number"
                    value={inputTemp}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "" || value === "-") {
                        setInputTemp(value);
                      } else {
                        const numValue = parseFloat(value);
                        if (
                          !isNaN(numValue) &&
                          numValue >= -45 &&
                          numValue <= 60
                        ) {
                          setInputTemp(value);
                        }
                      }
                    }}
                    placeholder="Indtast temperatur (-45 til 60°C)"
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      inputTemp &&
                      inputTemp !== "" &&
                      inputTemp !== "-" &&
                      (parseFloat(inputTemp) < -45 ||
                        parseFloat(inputTemp) > 60)
                        ? "border-red-500 bg-red-50"
                        : "border-gray-300"
                    }`}
                    step="0.1"
                    min="-45"
                    max="60"
                  />
                  {inputTemp &&
                    inputTemp !== "" &&
                    inputTemp !== "-" &&
                    (parseFloat(inputTemp) < -45 ||
                      parseFloat(inputTemp) > 60) && (
                      <p className="text-xs text-red-600 mt-1">
                        Temperatur skal være mellem -45°C og 60°C
                      </p>
                    )}
                  <p className="text-xs text-gray-500 mt-1">
                    Rød streg tegnes fra x-aksen op til kurven
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Dugpunktstemperatur (°C)
                  </label>
                  <input
                    type="number"
                    value={inputDewPoint}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "" || value === "-") {
                        setInputDewPoint(value);
                      } else {
                        const numValue = parseFloat(value);
                        if (
                          !isNaN(numValue) &&
                          numValue >= -45 &&
                          numValue <= 60
                        ) {
                          setInputDewPoint(value);
                        }
                      }
                    }}
                    placeholder="Indtast dugpunkt (-45 til 60°C)"
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      inputDewPoint &&
                      inputDewPoint !== "" &&
                      inputDewPoint !== "-" &&
                      (parseFloat(inputDewPoint) < -45 ||
                        parseFloat(inputDewPoint) > 60)
                        ? "border-red-500 bg-red-50"
                        : "border-gray-300"
                    }`}
                    step="0.1"
                    min="-45"
                    max="60"
                  />
                  {inputDewPoint &&
                    inputDewPoint !== "" &&
                    inputDewPoint !== "-" &&
                    (parseFloat(inputDewPoint) < -45 ||
                      parseFloat(inputDewPoint) > 60) && (
                      <p className="text-xs text-red-600 mt-1">
                        Dugpunkt skal være mellem -45°C og 60°C
                      </p>
                    )}
                  <p className="text-xs text-gray-500 mt-1">
                    Grøn streg tegnes vandret fra dugpunktet
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={reset}
                  className="w-full px-3 py-2 border rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300"
                >
                  Nulstil visning
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="w-full px-3 py-2 border rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300"
                >
                  {isFullscreen ? "Afslut fuldskærm" : "Fuldskærm"}
                </button>
                {intersectionPoint && (
                  <button
                    onClick={
                      showExplanation
                        ? stopExplanationAnimation
                        : startExplanationAnimation
                    }
                    className={`w-full px-3 py-2 border rounded-lg ${
                      showExplanation
                        ? "bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-300"
                        : "bg-green-50 hover:bg-green-100 text-green-700 border-green-300"
                    }`}
                  >
                    {showExplanation
                      ? "Stop forklaring"
                      : "Forklar beregningen"}
                  </button>
                )}

                <button
                  onClick={() => {
                    setInputTemp("");
                    setInputDewPoint("");
                    stopExplanationAnimation();
                  }}
                  className="w-full px-3 py-2 border rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border-red-300"
                >
                  Ryd streger
                </button>
              </div>

              {intersectionPoint && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <h3 className="font-semibold text-blue-800 mb-2">
                    Beregning af relativ luftfugtighed
                  </h3>

                  {showExplanation && (
                    <div className="mb-3 p-2 bg-white border rounded text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">Animation trin:</span>
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {animationStep === 1 &&
                            "Trin 1: Maksimalt vandindhold"}
                          {animationStep === 2 && "Trin 2: Faktisk vandindhold"}
                          {animationStep === 3 && "Trin 3: Beregning"}
                        </span>
                      </div>
                      <div className="flex space-x-1 mb-3">
                        <div
                          className={`h-2 flex-1 rounded ${
                            animationStep >= 1 ? "bg-red-500" : "bg-gray-200"
                          }`}
                        ></div>
                        <div
                          className={`h-2 flex-1 rounded ${
                            animationStep >= 2 ? "bg-green-500" : "bg-gray-200"
                          }`}
                        ></div>
                        <div
                          className={`h-2 flex-1 rounded ${
                            animationStep >= 3 ? "bg-purple-500" : "bg-gray-200"
                          }`}
                        ></div>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={previousAnimationStep}
                          disabled={animationStep <= 1}
                          className={`px-3 py-1 text-xs rounded ${
                            animationStep <= 1
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                          }`}
                        >
                          ← Forrige
                        </button>
                        <button
                          onClick={nextAnimationStep}
                          disabled={animationStep >= 3}
                          className={`px-3 py-1 text-xs rounded ${
                            animationStep >= 3
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "bg-green-100 text-green-700 hover:bg-green-200"
                          }`}
                        >
                          Næste →
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1 text-sm">
                    <p>
                      <strong>Temperatur:</strong>{" "}
                      {intersectionPoint.temperature} °C
                    </p>
                    <p>
                      <strong>Dugpunkt:</strong> {intersectionPoint.dewPoint} °C
                    </p>
                    <p>
                      <strong>Luftfugtighed:</strong>{" "}
                      {intersectionPoint.humidity.toFixed(2)} g/m³
                    </p>
                    <p>
                      <strong>Relativ fugtighed:</strong>{" "}
                      {intersectionPoint.relativeHumidity.toFixed(1)}%
                    </p>
                  </div>

                  <div className="mt-3 p-2 bg-white border rounded text-xs">
                    <p className="font-medium mb-2">
                      Beregning af relativ fugtighed:
                    </p>
                    <div className="space-y-2">
                      <p>
                        <InlineMath math="\text{RH} = \frac{\text{faktisk indhold}}{\text{maksimalt indhold}}" />
                      </p>
                      <p>
                        <InlineMath
                          math={`\\text{RH} = \\frac{${absoluteHumidity(
                            intersectionPoint.dewPoint
                          )
                            .toFixed(1)
                            .replace(
                              ".",
                              ","
                            )} \\text{ g/m³}}{${absoluteHumidity(
                            intersectionPoint.temperature
                          )
                            .toFixed(1)
                            .replace(".", ",")} \\text{ g/m³}}`}
                        />
                      </p>
                      <p>
                        <InlineMath
                          math={`\\text{RH} = \\frac{${absoluteHumidity(
                            intersectionPoint.dewPoint
                          )
                            .toFixed(1)
                            .replace(".", ",")}}{${absoluteHumidity(
                            intersectionPoint.temperature
                          )
                            .toFixed(1)
                            .replace(".", ",")}}`}
                        />
                      </p>
                      <p>
                        <InlineMath
                          math={`\\text{RH} = ${(
                            (absoluteHumidity(intersectionPoint.dewPoint) /
                              absoluteHumidity(intersectionPoint.temperature)) *
                            100
                          )
                            .toFixed(1)
                            .replace(".", ",")} \\%`}
                        />
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <p className="mt-4 text-xs text-slate-500">
                Magnus formel (Sonntag90): Ew = α·exp((β·T)/(λ+T)) hvor α=6.112
                hPa, β=17.62, λ=243.12 °C.
              </p>
            </div>
          </div>

          {/* Højre side - Graf */}
          <div className="flex-1">
            <div className="rounded-xl border">
              <Plot
                key={plotKey}
                data={data}
                layout={{ ...layout, autosize: true }}
                style={{
                  width: "100%",
                  height: isFullscreen ? "85vh" : "60vh",
                }}
                config={config}
                useResizeHandler
                onRelayout={(eventData) => {
                  if (
                    eventData["xaxis.range[0]"] !== undefined &&
                    eventData["xaxis.range[1]"] !== undefined &&
                    eventData["yaxis.range[0]"] !== undefined &&
                    eventData["yaxis.range[1]"] !== undefined
                  ) {
                    setCurrentZoom({
                      x: [
                        eventData["xaxis.range[0]"],
                        eventData["xaxis.range[1]"],
                      ],
                      y: [
                        eventData["yaxis.range[0]"],
                        eventData["yaxis.range[1]"],
                      ],
                    });
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
