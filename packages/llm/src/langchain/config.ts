const DEFAULT_RAG_CONFIDENCE_THRESHOLD = 0.7;

export const getRagConfidenceThreshold = (): number => {
  const raw = process.env.RAG_CONFIDENCE_THRESHOLD;

  if (!raw || raw.trim() === '') {
    return DEFAULT_RAG_CONFIDENCE_THRESHOLD;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return DEFAULT_RAG_CONFIDENCE_THRESHOLD;
  }

  return parsed;
};
