import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter-tight/index.css";
import App from "./App";
import { installKeyboardHelpers } from "./lib/keyboard";
import "./index.css";

installKeyboardHelpers();
createRoot(document.getElementById("root")!).render(<App />);
