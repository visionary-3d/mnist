import { startApp } from "./app";
import { initEngine, useCanvasContext } from "./engine/init";
import "./style.scss";

async function init() {
  await initEngine();
  const context = useCanvasContext();
  if (context) {
    await startApp();
  }
}

init();
