import { createRoot } from "react-dom/client";
import App from "./App.tsx";

import "leaflet/dist/leaflet.css"; // ✅ REQUIRED for react-leaflet
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);