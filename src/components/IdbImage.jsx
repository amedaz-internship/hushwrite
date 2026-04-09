import { useEffect, useState } from "react";
import { getImage } from "../js/db";

const isIdbUrl = (s) => typeof s === "string" && s.startsWith("idb://");

// Renders an <img> for a markdown image whose src is an `idb://<uuid>` URL.
// Looks the blob up in IndexedDB and converts it to a data URL on mount.
// Falls back to a normal <img> for any other src so external URLs still work.
//
// We track BOTH the resolved data URL and the src it corresponds to. If the
// component is reused (same instance, different src — happens when MDEditor
// rerenders the preview tree), the cache mismatch causes us to render null
// until the effect catches up. This avoids calling setState synchronously
// inside the effect to "reset" stale state, which the lint config bans.
const IdbImage = ({ src, alt, ...rest }) => {
  const [resolved, setResolved] = useState({ src: null, dataUrl: null });

  useEffect(() => {
    if (!isIdbUrl(src)) return;
    let cancelled = false;
    (async () => {
      const id = src.slice("idb://".length);
      const entry = await getImage(id);
      if (!entry || cancelled) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (!cancelled) setResolved({ src, dataUrl: reader.result });
      };
      reader.readAsDataURL(entry.blob);
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!isIdbUrl(src)) {
    return src ? <img src={src} alt={alt || ""} {...rest} /> : null;
  }
  if (resolved.src !== src || !resolved.dataUrl) return null;
  return <img src={resolved.dataUrl} alt={alt || ""} {...rest} />;
};

export default IdbImage;
