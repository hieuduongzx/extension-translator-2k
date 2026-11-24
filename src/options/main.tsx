import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initSystemThemeEarly } from "../shared/theme";
import { OptionsApp } from "./OptionsApp";
import "../shared/tokens.css";
import "../shared/ui.css";
import "./styles.css";

initSystemThemeEarly();

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root in options.html");

createRoot(container).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>
);
