import { render } from "@shadow-js/core";
import App from "./App";
import "./style.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}
render(App, root);
