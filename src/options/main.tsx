import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OptionsApp } from "./OptionsApp";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root in options.html");

createRoot(container).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>
);
