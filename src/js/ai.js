// On-device AI engine wrapper. WebLLM runs Llama 3.2 3B in a Web Worker
// over WebGPU. Plaintext never leaves the device.

export const AI_MODEL_ID = "Llama-3.2-3B-Instruct-q4f16_1-MLC";
export const AI_MODEL_LABEL = "Llama 3.2 3B Instruct";
export const AI_MODEL_SIZE_LABEL = "~1.8 GB";
export const AI_ENABLED_KEY = "hushwrite-ai-enabled";

let engine = null;
let worker = null;
let loadingPromise = null;

let state = {
  status: "idle", // "idle" | "loading" | "ready" | "unsupported" | "error"
  progress: 0,
  progressText: "",
  error: null,
};

const listeners = new Set();
const emit = (next) => {
  state = { ...state, ...next };
  for (const l of listeners) l(state);
};

export const getAIState = () => state;

export const subscribeAI = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const isAISupported = () => {
  if (typeof navigator === "undefined") return false;
  return "gpu" in navigator;
};

export const isAIEnabled = () => {
  try {
    return localStorage.getItem(AI_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
};

export const setAIEnabled = (v) => {
  try {
    if (v) localStorage.setItem(AI_ENABLED_KEY, "1");
    else localStorage.removeItem(AI_ENABLED_KEY);
  } catch {
    /* localStorage blocked */
  }
};

export const isModelDownloaded = async () => {
  try {
    const mod = await import("@mlc-ai/web-llm");
    if (typeof mod.hasModelInCache === "function") {
      return await mod.hasModelInCache(AI_MODEL_ID);
    }
  } catch {
    /* fall through */
  }
  return false;
};

export const ensureLoaded = async () => {
  if (!isAISupported()) {
    emit({
      status: "unsupported",
      error:
        "WebGPU is not available in this browser. Try Chrome, Edge, or Safari 18+.",
    });
    throw new Error(
      "WebGPU is not available in this browser. Try Chrome, Edge, or Safari 18+.",
    );
  }
  if (engine) return engine;
  if (loadingPromise) return loadingPromise;

  emit({
    status: "loading",
    progress: 0,
    progressText: "Starting…",
    error: null,
  });

  loadingPromise = (async () => {
    try {
      const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
      worker = new Worker(
        new URL("../workers/ai.worker.js", import.meta.url),
        { type: "module" },
      );
      engine = await CreateWebWorkerMLCEngine(worker, AI_MODEL_ID, {
        initProgressCallback: (p) => {
          emit({
            progress: typeof p?.progress === "number" ? p.progress : 0,
            progressText: p?.text || "",
          });
        },
      });
      emit({ status: "ready", progress: 1, progressText: "Ready" });
      return engine;
    } catch (err) {
      engine = null;
      if (worker) {
        try {
          worker.terminate();
        } catch {
          /* noop */
        }
        worker = null;
      }
      const message = err?.message || String(err);
      emit({ status: "error", error: message });
      throw err;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
};

export const unloadAI = async () => {
  try {
    await engine?.unload?.();
  } catch {
    /* noop */
  }
  if (worker) {
    try {
      worker.terminate();
    } catch {
      /* noop */
    }
    worker = null;
  }
  engine = null;
  emit({ status: "idle", progress: 0, progressText: "", error: null });
};

export const removeModelCache = async () => {
  await unloadAI();
  if (typeof caches === "undefined") return;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((k) => {
        const lower = k.toLowerCase();
        return (
          lower.includes("webllm") ||
          lower.includes("mlc") ||
          lower.includes("tvm")
        );
      })
      .map((k) => caches.delete(k)),
  );
};

const SYSTEM_PROMPTS = {
  improve:
    "You are a writing assistant. Improve the user's note for clarity, grammar, and flow. Preserve the original meaning, voice, language, and any markdown formatting. Return ONLY the rewritten note — no preamble, no explanation, no surrounding quotes.",
  summarize:
    "You are a writing assistant. Write a concise summary (3-5 sentences) of the user's note. Return ONLY the summary — no preamble, no headings.",
  title:
    "You are a writing assistant. Generate a short, descriptive title (3-7 words) for the user's note. No quotes, no trailing punctuation, no preamble. Return ONLY the title text.",
  continue:
    "You are a writing assistant. Continue the user's note in the same voice and style. Return ONLY the new content to append — no preamble, no repetition of the existing note.",
};

const TASK_OPTIONS = {
  improve: { temperature: 0.4, max_tokens: 2048 },
  summarize: { temperature: 0.3, max_tokens: 512 },
  title: { temperature: 0.4, max_tokens: 32 },
  continue: { temperature: 0.7, max_tokens: 1024 },
};

export const aiComplete = async ({ task, content, onToken, signal }) => {
  const eng = await ensureLoaded();
  const system =
    SYSTEM_PROMPTS[task] || "You are a helpful writing assistant.";
  const opts = TASK_OPTIONS[task] || { temperature: 0.5, max_tokens: 1024 };

  const stream = await eng.chat.completions.create({
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    stream: true,
    ...opts,
  });

  let full = "";
  for await (const chunk of stream) {
    if (signal?.aborted) {
      try {
        await eng.interruptGenerate?.();
      } catch {
        /* noop */
      }
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    const delta = chunk?.choices?.[0]?.delta?.content || "";
    if (delta) {
      full += delta;
      onToken?.(delta, full);
    }
  }
  return full.trim();
};
