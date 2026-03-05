import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GlobalWorkerOptions } from "pdfjs-dist";
import "react-pdf-highlighter/dist/style.css";
import "./App.css";
import App from "./App.tsx";

GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
