import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-basic-dist";

// Fælles Plot-komponent bygget på plotly.js-basic-dist (kun scatter/linjer):
// skærer ~65 % af bundlen i forhold til fuld plotly.js.
export default createPlotlyComponent(Plotly);
