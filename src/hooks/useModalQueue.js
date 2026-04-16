import { useCallback, useMemo, useRef, useState } from "react";

// Promise-returning modal queue. Opening a new modal while one is already
// open rejects the previous Promise with "superseded" so the prior caller
// doesn't hang forever.
//
// Each modal's confirm/cancel are bound to that specific modal's id. This
// guards against late-firing dialog lifecycle events (e.g. Radix's
// onOpenChange firing in the next frame) from accidentally cancelling a
// *follow-up* modal the consumer just opened.
export function useModalQueue() {
  const [modal, setModal] = useState(null);
  const idRef = useRef(0);

  const open = useCallback((spec) => {
    return new Promise((resolve, reject) => {
      setModal((prev) => {
        prev?.reject?.(new Error("superseded"));
        const id = ++idRef.current;
        return { ...spec, id, resolve, reject };
      });
    });
  }, []);

  // Settle the *current* modal. Safe fallbacks for consumers that don't
  // thread an id through (e.g. inline handlers). For the race-sensitive
  // path use the modal-bound handlers on `modal` directly.
  const confirm = useCallback((value) => {
    setModal((m) => {
      if (!m) return null;
      m.resolve?.(value);
      return null;
    });
  }, []);

  const cancel = useCallback(() => {
    setModal((m) => {
      if (!m) return null;
      m.reject?.(new Error("cancelled"));
      return null;
    });
  }, []);

  // Bind confirm/cancel to the currently-open modal's id so a late-firing
  // event cannot settle a modal opened afterwards.
  const boundModal = useMemo(() => {
    if (!modal) return null;
    const { id } = modal;
    return {
      ...modal,
      confirm: (value) =>
        setModal((m) => {
          if (!m || m.id !== id) return m;
          m.resolve?.(value);
          return null;
        }),
      cancel: () =>
        setModal((m) => {
          if (!m || m.id !== id) return m;
          m.reject?.(new Error("cancelled"));
          return null;
        }),
    };
  }, [modal]);

  return { modal: boundModal, open, confirm, cancel };
}
