import React, { useEffect, useRef, useState } from "react";
import { fmt1 } from "../utils/meteorology";

// Interaktiv luftpakke — kontrolleret af forælderen: heightKm er den fælles
// løftehøjde (slider og pakke styrer samme værdi), temp/phase beregnes i
// forælderen, og træk rapporteres via onDragHeight. Pointer events dækker
// både mus og touch (den gamle version virkede ikke på mobil).
export default function AirMassAnimation({
  heightKm,
  condensationHeightKm,
  temp,
  phase,
  onDragHeight,
  isActive,
}) {
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);
  const scaleRef = useRef(2);

  // Skala: fra jorden til 1 km over kondensationsniveauet (mindst 2 km);
  // følger løftehøjden hvis slideren sættes højere. Fryses under træk, så
  // pakken ikke "flygter" fra fingeren.
  const baseScale = Math.max((condensationHeightKm || 0) + 1, 2, isActive ? heightKm + 0.3 : 2);
  if (!isDragging) scaleRef.current = baseScale;
  const maxHeight = scaleRef.current;

  const heightFromPointer = (clientY) => {
    const rect = containerRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    return frac * maxHeight;
  };

  const onPointerDown = (e) => {
    if (!isActive) return;
    e.preventDefault();
    setIsDragging(true);
    onDragHeight(heightFromPointer(e.clientY));
  };

  useEffect(() => {
    if (!isDragging) return;
    const move = (e) => {
      e.preventDefault();
      onDragHeight(heightFromPointer(e.clientY));
    };
    const up = () => setIsDragging(false);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });

  // Luftpakken udvider sig når den stiger (forenklet visuel skala)
  const volumeScale = Math.max(0.6, Math.min(1.6, 0.6 + (heightKm / maxHeight) * 0.8));

  const saturated = isActive && condensationHeightKm !== null && heightKm >= condensationHeightKm - 0.001;
  const parcelColor =
    phase === "moist"
      ? "bg-gray-200 border-gray-400"
      : saturated
      ? "bg-white border-gray-300"
      : "bg-orange-100 border-orange-300";

  const cloudOpacity =
    phase === "moist" && condensationHeightKm !== null
      ? Math.min(0.85, ((heightKm - condensationHeightKm) / 1.5) * 0.85)
      : 0;

  // Pæne runde højdemærker
  const steps = [];
  for (let i = 0; i <= 4; i++) {
    const h = (maxHeight * 1000 * i) / 4;
    steps.push(h >= 1000 ? Math.round(h / 500) * 500 : Math.round(h / 100) * 100);
  }

  return (
    <div
      className="w-full h-full rounded-xl border border-sky-200 relative overflow-hidden select-none bg-gradient-to-b from-sky-200 via-sky-100 to-emerald-50"
      style={{ touchAction: "none" }}
    >
      {/* Skylag over kondensationsniveauet */}
      {condensationHeightKm !== null && condensationHeightKm < maxHeight && (
        <div
          className="absolute left-0 right-0 bg-white transition-opacity duration-300 pointer-events-none"
          style={{
            opacity: cloudOpacity,
            top: 0,
            height: `${100 - (condensationHeightKm / maxHeight) * 100}%`,
            maskImage: "linear-gradient(to top, transparent, black 30%)",
            WebkitMaskImage: "linear-gradient(to top, transparent, black 30%)",
          }}
        />
      )}

      {/* Højdeskala */}
      <div className="absolute left-2 top-1 bottom-1 flex flex-col justify-between text-[10px] text-gray-500 pointer-events-none">
        {[...steps].reverse().map((h, i) => (
          <div key={i}>{h >= 1000 ? `${(h / 1000).toFixed(1).replace(".", ",")} km` : `${h} m`}</div>
        ))}
      </div>
      {steps.map((h, i) => (
        <div
          key={i}
          className="absolute left-12 right-0 border-t border-sky-300/50 border-dashed pointer-events-none"
          style={{ bottom: `${(h / (maxHeight * 1000)) * 100}%` }}
        />
      ))}

      {/* Kondensationsniveau (LCL) */}
      {isActive && condensationHeightKm > 0 && condensationHeightKm <= maxHeight && (
        <div
          className="absolute left-12 right-0 border-t-2 border-dashed pointer-events-none"
          style={{
            bottom: `${(condensationHeightKm / maxHeight) * 100}%`,
            borderColor: "#047857",
          }}
        >
          <span className="absolute right-1 -top-4 text-[10px] text-emerald-700 bg-white/70 px-1 rounded">
            Kondensation {Math.round(condensationHeightKm * 1000)} m
          </span>
        </div>
      )}

      {/* Trækområde + luftpakke */}
      <div
        ref={containerRef}
        className={`absolute left-12 right-0 top-0 bottom-0 ${isActive ? "cursor-grab" : ""} ${
          isDragging ? "cursor-grabbing" : ""
        }`}
        onPointerDown={onPointerDown}
      >
        {isActive && (
          <div
            className={`absolute left-1/2 w-16 h-16 rounded-full border-2 shadow-md ${parcelColor} flex flex-col items-center justify-center ${
              !isDragging ? "transition-all duration-200" : ""
            }`}
            style={{
              bottom: `${Math.max(0, Math.min(100, (heightKm / maxHeight) * 100))}%`,
              transform: `translate(-50%, 50%) scale(${volumeScale})`,
            }}
          >
            <div className="text-xs font-semibold text-gray-800">
              {temp !== null ? `${fmt1(temp)} °C` : ""}
            </div>
            <div className="text-[10px] text-gray-600">{phase === "moist" ? "våd" : "tør"}</div>
          </div>
        )}
      </div>

      {/* Jordoverflade */}
      <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-emerald-300/70 pointer-events-none" />

      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl">
          <div className="text-center text-gray-500 text-sm px-4">
            Indtast temperatur og dugpunkt for at aktivere luftpakken
          </div>
        </div>
      )}
    </div>
  );
}
