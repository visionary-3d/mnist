// Purpose: Contains constants used throughout the application.

import { Value } from "../../utils/structs";

// constants
const GLOBAL_DEBUG = true;

export const DEBUG_INFO: DebugInfo = {
};

// ------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------

// logic

const DEBUG = new Value(GLOBAL_DEBUG);

export const initDebugInfo = () => {
  const values = Object.values(DEBUG_INFO);
  const keys = Object.keys(DEBUG_INFO);
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const key = keys[i];

    DEBUG_INFO[key] = value && DEBUG.value;
  }
};

type DebugInfo = { [key: string]: boolean };

export const useDebug = () => DEBUG.value;
