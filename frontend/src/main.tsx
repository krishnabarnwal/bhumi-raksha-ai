import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./theme";

// StrictMode intentionally omitted: it double-invokes effects in dev, which
// would tear down and rebuild the MapLibre instance on every mount.
createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <I18nProvider>
      <App />
    </I18nProvider>
  </ThemeProvider>,
);
