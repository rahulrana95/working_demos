/* NOT PART OF THE INTERVIEW: production version. Starts the demo page. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// The "!" is safe: index.html always has the element with the id "root".
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
