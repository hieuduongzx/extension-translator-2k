import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Popup } from "./Popup";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root in popup.html");

createRoot(container).render(
  <StrictMode>
    <Popup />
  </StrictMode>
);
