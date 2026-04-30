import { useSyncExternalStore } from "react";
import {
  getAIState,
  subscribeAI,
  ensureLoaded,
  unloadAI,
  removeModelCache,
  isAISupported,
  isAIEnabled,
  setAIEnabled,
  isModelDownloaded,
  aiComplete,
} from "@/js/ai";

export const useAI = () => {
  const state = useSyncExternalStore(subscribeAI, getAIState, getAIState);
  return {
    status: state.status,
    progress: state.progress,
    progressText: state.progressText,
    error: state.error,
    supported: isAISupported(),
    enabled: isAIEnabled(),
    setEnabled: setAIEnabled,
    ensureLoaded,
    unload: unloadAI,
    removeModelCache,
    isModelDownloaded,
    complete: aiComplete,
  };
};
