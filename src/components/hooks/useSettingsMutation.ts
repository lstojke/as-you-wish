import { useRef, useState } from "react";

export function useSettingsMutation() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);

  function start() {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    return true;
  }

  function finish() {
    inFlight.current = false;
    setBusy(false);
  }

  return { busy, start, finish };
}
