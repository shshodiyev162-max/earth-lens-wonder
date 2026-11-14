import { createRoot } from "react-dom/client";
import App from "./App.tsx";

// Fonts are bundled with the app (no request to Google), in the weights the design uses; each
// browser downloads only the alphabets a page needs.
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "leaflet/dist/leaflet.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
