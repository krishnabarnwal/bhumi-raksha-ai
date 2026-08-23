import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// StrictMode intentionally omitted: it double-invokes effects in dev, which
// would tear down and rebuild the MapLibre instance on every mount.
createRoot(document.getElementById("root")!).render(<App />);
