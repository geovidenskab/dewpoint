import React, { useState, Suspense, lazy } from "react";

// Lazy load af de to værktøjer for code splitting
const DugpunktskurveApp = lazy(() => import("./components/DugpunktskurveApp"));
const AdiabaticCoolingApp = lazy(() => import("./components/AdiabaticCoolingApp"));

const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-12">
    <div className="motion-safe:animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    <span className="ml-3 text-gray-600">Indlæser…</span>
  </div>
);

const MODES = [
  { id: "humidity", name: "Relativ luftfugtighed" },
  { id: "adiabatic", name: "Adiabatisk afkøling" },
];

export default function App() {
  const [selectedMode, setSelectedMode] = useState("humidity");

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)" }}
    >
      {/* Header */}
      <header className="bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl" aria-hidden="true">🌍</span>
              <div>
                <h1 className="text-xl lg:text-2xl font-semibold text-gray-900 tracking-tight">
                  <span className="text-blue-600">GEO</span> Dugpunkt
                </h1>
                <p className="text-gray-500 text-sm font-light">
                  Interaktive værktøjer til luftfugtighed og adiabatiske processer
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Segmented control — aktiv fane er hvid med skygge */}
              <div className="bg-gray-100 rounded-lg p-1 flex" role="tablist">
                {MODES.map((mode) => (
                  <button
                    key={mode.id}
                    role="tab"
                    aria-selected={selectedMode === mode.id}
                    onClick={() => setSelectedMode(mode.id)}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                      selectedMode === mode.id
                        ? "bg-white text-blue-700 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {mode.name}
                  </button>
                ))}
              </div>

              <a
                href="/"
                className="text-sm text-gray-500 hover:text-blue-700 transition-colors whitespace-nowrap"
              >
                Til GEO Apps →
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Indhold — key på mode giver et blidt fade ved skift */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Suspense fallback={<LoadingSpinner />}>
          <div key={selectedMode} className="motion-safe:animate-[fadein_0.2s_ease-out]">
            {selectedMode === "humidity" ? <DugpunktskurveApp /> : <AdiabaticCoolingApp />}
          </div>
        </Suspense>
      </main>

      <footer className="mt-8 pb-8">
        <p className="text-center text-gray-400 text-sm font-light">
          Udviklet af Philip K. Jakobsen
        </p>
      </footer>
    </div>
  );
}
