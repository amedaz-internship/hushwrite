import { useCallback, useState } from "react";

// Promise-returning modal queue. Opening a new modal while one is already
// open rejects the previous Promise with "superseded" so the prior caller
// doesn't hang forever.
export function useModalQueue() {
  const [modal, setModal] = useState(null);

  const open = useCallback((spec) => {
    return new Promise((resolve, reject) => {
      setModal((prev) => {
        prev?.reject?.(new Error("superseded"));
        return { ...spec, resolve, reject };
      });
    });
  }, []);

  const confirm = useCallback((value) => {
    setModal((m) => {
      m?.resolve?.(value);
      return null;
    });
  }, []);

  const cancel = useCallback(() => {
    setModal((m) => {
      m?.reject?.(new Error("cancelled"));
      return null;
    });
  }, []);

  return { modal, open, confirm, cancel };
}
