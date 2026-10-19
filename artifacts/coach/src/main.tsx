import { createRoot } from "react-dom/client";
import App from "./App";
import { installKeyboardHelpers } from "./lib/keyboard";
import "./index.css";

installKeyboardHelpers();
createRoot(document.getElementById("root")!).render(<App />);
