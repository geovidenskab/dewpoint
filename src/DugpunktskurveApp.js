import React, { useMemo, useState, useEffect } from "react";
import Plot from "react-plotly.js";
import "katex/dist/katex.min.css";
import { InlineMath, BlockMath } from "react-katex";

// Simpel interaktiv dugpunktskurve
// - Én kurve styret af en RH-slider
// - Zoom/pan for at ændre akserne (dobbeltklik for reset)
export default function DugpunktskurveApp() {
  const [plotKey, setPlotKey] = useState(0);
  const [inputTemp, setInputTemp] = useState("");
  const [inputDewPoint, setInputDewPoint] = useState("");
  const [intersectionPoint, setIntersectionPoint] = useState(null);
  const [currentZoom, setCurrentZoom] = useState({ x: [-10, 40], y: [0, 50] });
  const [showExplanation, setShowExplanation] = useState(false);
  const [animationStep, setAnimationStep] = useState(0);
  const [pulseOpacity, setPulseOpacity] = useState(0);
  const [showUnsaturated, setShowUnsaturated] = useState(false);

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
      // Blå gennemsigtig baggrund for umættet område (kun når aktiveret)
      ...(showUnsaturated
        ? [
            {
              x: xs, // Brug mætningskurvens x-værdier
              y: ys, // Brug mætningskurvens y-værdier
              type: "scatter",
              mode: "lines",
              fill: "tozeroy", // Fyld området fra kurven ned til y=0
              fillcolor: "rgba(59, 130, 246, 0.1)", // Mere synlig blå gennemsigtig
              line: {
                color: "rgba(59, 130, 246, 0.5)",
                width: 2,
              },
              name: "Umættet",
              showlegend: true,
              legendgroup: "umættet",
              hovertemplate: "Umættet område<extra></extra>",
            },
          ]
        : []),
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

    // Rød vertikal streg fra temperatur input (kun når forklaring ikke er aktiv)
    if (inputTemp && !isNaN(parseFloat(inputTemp)) && !showExplanation) {
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
          hovertemplate: `T: ${temp} °C<br>Luftfugtighed: ${humidity
            .toFixed(2)
            .replace(".", ",")} g/m³<extra></extra>`,
        });
      }
    }

    // Grøn streg fra dugpunkt input - først lodret op til kurven, så vandret til venstre (kun når forklaring ikke er aktiv)
    if (
      inputDewPoint &&
      !isNaN(parseFloat(inputDewPoint)) &&
      !showExplanation
    ) {
      const dewPoint = parseFloat(inputDewPoint);
      if (dewPoint >= -45 && dewPoint <= 60) {
        const humidity = absoluteHumidity(dewPoint);
        traces.push({
          x: [dewPoint, dewPoint], // Kun lodret streg fra x-akse til kurven
          y: [0, humidity], // Fra x-akse til kurven
          type: "scatter",
          mode: "lines",
          name: "Dugpunkt streg",
          line: {
            color: "#3b82f6",
            width: 2.5,
            dash: "dot",
            shape: "linear",
          },
          showlegend: true,
          legendgroup: "dugpunkt",
          hovertemplate: `Dugpunkt: ${dewPoint} °C<br>Luftfugtighed: ${humidity
            .toFixed(2)
            .replace(".", ",")} g/m³<extra></extra>`,
        });

        // Blå cirkel ved dugpunktet
        traces.push({
          x: [dewPoint],
          y: [humidity],
          type: "scatter",
          mode: "markers",
          name: "Dugpunkt",
          marker: {
            color: "#3b82f6",
            size: 14,
            line: {
              color: "#ffffff",
              width: 2,
            },
          },
          showlegend: false,
          hovertemplate: `Dugpunkt: ${dewPoint} °C<br>Luftfugtighed: ${humidity
            .toFixed(2)
            .replace(".", ",")} g/m³<extra></extra>`,
        });

        // Tekst "Dugpunkt" ved cirklen
        traces.push({
          x: [dewPoint], // Centreret over cirklen
          y: [humidity + 1.5], // 1.5 g/m³ over cirklen
          type: "scatter",
          mode: "text",
          text: ["Dugpunkt"],
          textposition: "top center",
          name: "Dugpunkt tekst",
          textfont: {
            color: "#1e40af", // Mørkere blå for bedre synlighed
            size: 14,
            family: "Arial, sans-serif",
            weight: "bold",
          },
          showlegend: false,
          hovertemplate: "Dugpunkt<extra></extra>",
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
          hovertemplate: `Krydsningspunkt<br>T: ${temp} °C<br>Dugpunkt: ${dewPoint} °C<br>Luftfugtighed: ${dewPointHumidity
            .toFixed(2)
            .replace(".", ",")} g/m³<br>RH: ${rh
            .toFixed(1)
            .replace(".", ",")}%<extra></extra>`,
        });

        // Signatur ved den sorte cirkel
        const xRange = currentZoom.x[1] - currentZoom.x[0];
        const luftmassenOffset = xRange * 0.05; // 5% af synlig x-range
        traces.push({
          x: [intersectionX + luftmassenOffset], // Dynamisk afstand til højre for cirklen
          y: [intersectionY], // Samme højde som cirklen
          type: "scatter",
          mode: "text",
          text: ["Luftmassen"],
          textposition: "middle right",
          name: "Luftmassen tekst",
          textfont: {
            color: "#1f2937", // Mørk grå for god synlighed
            size: 14,
            family: "Arial, sans-serif",
            weight: "bold",
          },
          showlegend: false,
          hovertemplate: "Luftmassen<extra></extra>",
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

            // Værdi og begreb ved dugpunktkurven (dynamisk positionering)
            if (animationStep === 1) {
              const xRange = currentZoom.x[1] - currentZoom.x[0];
              const textOffset = xRange * 0.02; // 2% af synlig x-range
              const step1TextX = Math.min(
                currentZoom.x[0] + textOffset,
                Math.min(temp, dewPoint) - xRange * 0.04
              ); // Tættere på linjen, undgå legend
              traces.push({
                x: [step1TextX], // Dynamisk x-værdi baseret på zoom
                y: [tempHumidity - 1], // Under den røde streg, undgå legend
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

              // Blå cirkel ved dugpunktet (beholdes under forklaring)
              traces.push({
                x: [dewPoint],
                y: [dewPointHumidity],
                type: "scatter",
                mode: "markers",
                name: "Dugpunkt cirkel",
                marker: {
                  color: "#3b82f6",
                  size: 12,
                  line: {
                    color: "#ffffff",
                    width: 2,
                  },
                },
                showlegend: false,
                hovertemplate: `Dugpunkt: ${dewPoint} °C<br>Luftfugtighed: ${dewPointHumidity
                  .toFixed(1)
                  .replace(".", ",")} g/m³<extra></extra>`,
              });
            }

            // Værdi og begreb ved krydset (dynamisk positionering)
            if (animationStep === 2) {
              const xRange = currentZoom.x[1] - currentZoom.x[0];
              const textOffset = xRange * 0.02; // 2% af synlig x-range
              const step2TextX = Math.min(
                currentZoom.x[0] + textOffset,
                Math.min(temp, dewPoint) - xRange * 0.04
              ); // Tættere på linjen, undgå legend
              traces.push({
                x: [step2TextX], // Dynamisk x-værdi baseret på zoom
                y: [dewPointHumidity - 1], // Under den grønne streg, undgå legend
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
              // Placér formlen dynamisk baseret på zoom-niveau
              const xRange = currentZoom.x[1] - currentZoom.x[0];
              const textOffset = xRange * 0.02; // 2% af synlig x-range
              const formelX = Math.min(
                currentZoom.x[0] + textOffset,
                Math.min(temp, dewPoint) - xRange * 0.04
              ); // Tættere på linjen, undgå legend
              const midY = tempHumidity / 2; // Halvvejs ned ad y-aksen fra det maksimale

              // Beregn RH som forholdet mellem faktisk og maksimalt vandindhold
              const calculatedRH = (dewPointHumidity / tempHumidity) * 100;

              traces.push({
                x: [formelX],
                y: [midY], // Placeret ved midtpunktet, undgå legend
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

              // Værdi ved den grønne cirkel (dynamisk positionering)
              const xRange = currentZoom.x[1] - currentZoom.x[0];
              const greenTextX = dewPoint - xRange * 0.1; // Længere til venstre for cirklen
              traces.push({
                x: [greenTextX],
                y: [dewPointHumidity],
                type: "scatter",
                mode: "text",
                text: [`${dewPointHumidity.toFixed(1).replace(".", ",")} g/m³`],
                textposition: "middle right",
                name: "Faktisk indhold værdi",
                textfont: {
                  color: "#10b981",
                  size: 14,
                  family: "Arial, sans-serif",
                  weight: "bold",
                },
                showlegend: false,
                hovertemplate: `Faktisk indhold: ${dewPointHumidity
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

              // Værdi ved den røde cirkel (dynamisk positionering)
              const xRange = currentZoom.x[1] - currentZoom.x[0];
              const redTextX = temp - xRange * 0.1; // Længere til venstre for cirklen
              traces.push({
                x: [redTextX],
                y: [tempHumidity],
                type: "scatter",
                mode: "text",
                text: [`${tempHumidity.toFixed(1).replace(".", ",")} g/m³`],
                textposition: "middle right",
                name: "Maksimalt indhold værdi",
                textfont: {
                  color: "#dc2626",
                  size: 14,
                  family: "Arial, sans-serif",
                  weight: "bold",
                },
                showlegend: false,
                hovertemplate: `Maksimalt indhold: ${tempHumidity
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
    showUnsaturated,
    currentZoom,
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
    height: Math.max(500, window.innerHeight * 0.7),
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
    setPlotKey((k) => k + 1); // Nulstil visning
    setInputTemp(""); // Ryd temperatur input
    setInputDewPoint(""); // Ryd dugpunkt input
    stopExplanationAnimation(); // Stop forklaring hvis aktiv
  };

  const checkAndAdjustZoom = (temp, dewPoint) => {
    // Beregn luftfugtigheder
    const tempHumidity = absoluteHumidity(temp);
    const dewPointHumidity = absoluteHumidity(dewPoint);
    const maxHumidity = Math.max(tempHumidity, dewPointHumidity);
    const minHumidity = Math.min(tempHumidity, dewPointHumidity);

    // Find min og max temperaturer
    const minTemp = Math.min(temp, dewPoint);
    const maxTemp = Math.max(temp, dewPoint);

    // Beregn passende zoom-interval med margin
    const tempMargin = Math.max(8, (maxTemp - minTemp) * 0.4); // Mindst 8°C margin, eller 40% af temperaturspændet
    const humidityMargin = Math.max(3, (maxHumidity - minHumidity) * 0.4); // Mindst 3 g/m³ margin, eller 40% af fugtighedsspændet

    // Sæt nye zoom-grænser med mere fokus på lavere x-værdier
    const newZoom = {
      x: [
        Math.max(-45, minTemp - tempMargin * 1.5), // Giv mere plads til lavere temperaturer
        Math.min(60, maxTemp + tempMargin * 0.8), // Mindre plads til højere temperaturer
      ],
      y: [
        0, // Start altid fra 0 g/m³
        maxHumidity + humidityMargin,
      ],
    };

    // Opdater zoom kun hvis det er væsentligt anderledes
    const xRangeChanged =
      Math.abs(
        newZoom.x[1] - newZoom.x[0] - (currentZoom.x[1] - currentZoom.x[0])
      ) > 1;
    const yRangeChanged = Math.abs(newZoom.y[1] - currentZoom.y[1]) > 0.5;

    if (xRangeChanged || yRangeChanged) {
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
    <div className="min-h-screen bg-white text-slate-800">
      <div className="max-w-7xl mx-auto p-4">
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
                        const tempValue = inputTemp
                          ? parseFloat(inputTemp)
                          : null;
                        if (
                          !isNaN(numValue) &&
                          numValue >= -45 &&
                          numValue <= 60 &&
                          (tempValue === null || numValue <= tempValue)
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
                        parseFloat(inputDewPoint) > 60 ||
                        (inputTemp &&
                          parseFloat(inputDewPoint) > parseFloat(inputTemp)))
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
                      parseFloat(inputDewPoint) > 60 ||
                      (inputTemp &&
                        parseFloat(inputDewPoint) > parseFloat(inputTemp))) && (
                      <p className="text-xs text-red-600 mt-1">
                        {parseFloat(inputDewPoint) < -45 ||
                        parseFloat(inputDewPoint) > 60
                          ? "Dugpunkt skal være mellem -45°C og 60°C"
                          : "Dugpunkt kan ikke være højere end temperaturen"}
                      </p>
                    )}
                  <p className="text-xs text-gray-500 mt-1">
                    Grøn streg tegnes vandret fra dugpunktet
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
                  onClick={resetAndClear}
                  className="w-full px-3 py-2 border rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border-red-300"
                >
                  Ryd og nulstil
                </button>
              </div>

              {(intersectionPoint ||
                (showExplanation && inputTemp && inputDewPoint)) && (
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
                      {intersectionPoint
                        ? intersectionPoint.temperature
                        : parseFloat(inputTemp)}{" "}
                      °C
                    </p>
                    <p>
                      <strong>Dugpunkt:</strong>{" "}
                      {intersectionPoint
                        ? intersectionPoint.dewPoint
                        : parseFloat(inputDewPoint)}{" "}
                      °C
                    </p>
                    <p>
                      <strong>Luftfugtighed:</strong>{" "}
                      {intersectionPoint
                        ? intersectionPoint.humidity
                            .toFixed(2)
                            .replace(".", ",")
                        : absoluteHumidity(parseFloat(inputDewPoint))
                            .toFixed(2)
                            .replace(".", ",")}{" "}
                      g/m³
                    </p>
                    <p>
                      <strong>Relativ fugtighed:</strong>{" "}
                      {intersectionPoint
                        ? intersectionPoint.relativeHumidity
                            .toFixed(1)
                            .replace(".", ",")
                        : (
                            (absoluteHumidity(parseFloat(inputDewPoint)) /
                              absoluteHumidity(parseFloat(inputTemp))) *
                            100
                          )
                            .toFixed(1)
                            .replace(".", ",")}
                      %
                    </p>
                  </div>

                  <div className="mt-3 p-2 bg-white border rounded text-xs">
                    <div className="space-y-2">
                      <p>
                        <InlineMath math="\text{RH} = \frac{\text{faktisk indhold}}{\text{maksimalt indhold}}" />
                      </p>
                      <p>
                        <InlineMath
                          math={`\\text{RH} = \\frac{\\color{green}{${absoluteHumidity(
                            intersectionPoint
                              ? intersectionPoint.dewPoint
                              : parseFloat(inputDewPoint)
                          )
                            .toFixed(1)
                            .replace(
                              ".",
                              ","
                            )} \\text{ g/m³}}}{\\color{red}{${absoluteHumidity(
                            intersectionPoint
                              ? intersectionPoint.temperature
                              : parseFloat(inputTemp)
                          )
                            .toFixed(1)
                            .replace(".", ",")} \\text{ g/m³}}}`}
                        />
                      </p>
                      <p>
                        <InlineMath
                          math={`\\text{RH} = ${(
                            (absoluteHumidity(
                              intersectionPoint
                                ? intersectionPoint.dewPoint
                                : parseFloat(inputDewPoint)
                            ) /
                              absoluteHumidity(
                                intersectionPoint
                                  ? intersectionPoint.temperature
                                  : parseFloat(inputTemp)
                              )) *
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
                  height: "70vh",
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
