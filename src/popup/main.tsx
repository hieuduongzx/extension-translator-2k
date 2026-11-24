import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initSystemThemeEarly } from "../shared/theme";
import { Popup } from "./Popup";
import "../shared/tokens.css";
import "../shared/ui.css";
import "./styles.css";

initSystemThemeEarly();

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root in popup.html");

createRoot(container).render(
  <StrictMode>
    <Popup />
  </StrictMode>
);
