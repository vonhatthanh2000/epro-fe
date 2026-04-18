import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  CheckCircle,
  AlertCircle,
  Sparkles,
  History,
  Lightbulb,
  ArrowRight,
} from 'lucide-react';
import {
  API_ROUTES,
  PROFILE_ID_HEADER,
  apiFetch,
  sentenceDetailPath,
  unwrapApiPayload,
} from '../../config/api';
import { useProfile } from '../context/ProfileContext';

interface MistakeItem {
  type: string;
  original: string;
  fix: string;
  explanation: string;
}

interface ImprovementItem {
  original_phrase: string;
  improved_phrase: string;
  explanation: string;
}

interface SentenceAnalysis {
  id: string;
  original: string;
  corrected: string;
  natural: string;
  has_mistakes: boolean;
  mistakes: MistakeItem[];
  improvements: ImprovementItem[];
  tip: string;
  timestamp: Date;
  /** From GET /sentence/history — mistakes/improvements/tip not included. */
  isHistorySummary?: boolean;
}

function parseTimestamp(data: Record<string, unknown>): Date {
  const raw =
    data.timestamp ?? data.created_at ?? data.createdAt ?? data.updated_at;
  if (typeof raw === 'string' || typeof raw === 'number') {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function parseMistakeEntry(raw: unknown): MistakeItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    type: String(o.type ?? ''),
    original: String(o.original ?? ''),
    fix: String(o.fix ?? ''),
    explanation: String(o.explanation ?? ''),
  };
}

function parseImprovementEntry(raw: unknown): ImprovementItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  return {
    original_phrase: String(o.original_phrase ?? ''),
    improved_phrase: String(o.improved_phrase ?? ''),
    explanation: String(o.explanation ?? ''),
  };
}

function parseSentenceAnalysis(
  data: Record<string, unknown>,
  fallbackOriginal: string
): SentenceAnalysis {
  const mistakesRaw = data.mistakes;
  const improvementsRaw = data.improvements;

  const mistakes = Array.isArray(mistakesRaw)
    ? mistakesRaw.map(parseMistakeEntry).filter((m): m is MistakeItem => m != null)
    : [];

  const improvements = Array.isArray(improvementsRaw)
    ? improvementsRaw
        .map(parseImprovementEntry)
        .filter((m): m is ImprovementItem => m != null)
    : [];

  return {
    id: String(data.id ?? crypto.randomUUID()),
    original: String(data.original ?? fallbackOriginal),
    corrected: String(data.corrected ?? ''),
    natural: String(data.natural ?? ''),
    has_mistakes: Boolean(data.has_mistakes),
    mistakes,
    improvements,
    tip: String(data.tip ?? ''),
    timestamp: parseTimestamp(data),
    isHistorySummary: false,
  };
}

async function fetchSentenceDetail(
  sentenceId: string,
  signal?: AbortSignal
): Promise<SentenceAnalysis> {
  const res = await apiFetch(sentenceDetailPath(sentenceId), { method: 'GET', signal });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text || 'Invalid JSON from server');
  }
  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && 'message' in json
        ? String((json as { message: unknown }).message)
        : text || res.statusText;
    throw new Error(msg);
  }
  const payload = unwrapApiPayload(json) ?? (json as Record<string, unknown> | null);
  if (!payload) throw new Error('Empty response from server');
  const fallbackOriginal = String(payload.original ?? '');
  return parseSentenceAnalysis(payload, fallbackOriginal);
}

const HISTORY_PAGE_SIZE = 20;

function historyRowToSummary(row: Record<string, unknown>): SentenceAnalysis {
  return {
    id: String(row.id ?? ''),
    original: String(row.original ?? ''),
    corrected: String(row.corrected ?? ''),
    natural: String(row.natural ?? ''),
    has_mistakes: Boolean(row.has_mistakes),
    mistakes: [],
    improvements: [],
    tip: '',
    timestamp: parseTimestamp(row),
    isHistorySummary: true,
  };
}

function parseHistoryResponse(json: unknown): {
  items: SentenceAnalysis[];
  total: number;
  page: number;
  pageSize: number;
} {
  const payload = unwrapApiPayload(json) ?? (json as Record<string, unknown> | null);
  if (!payload) {
    return { items: [], total: 0, page: 0, pageSize: HISTORY_PAGE_SIZE };
  }
  const rawItems = payload.items;
  const items = Array.isArray(rawItems)
    ? rawItems
        .map((row) =>
          row && typeof row === 'object' ? historyRowToSummary(row as Record<string, unknown>) : null
        )
        .filter((x): x is SentenceAnalysis => x != null)
    : [];
  return {
    items,
    total: Number(payload.total ?? 0),
    page: Number(payload.page ?? 0),
    pageSize: Number(payload.page_size ?? payload.pageSize ?? HISTORY_PAGE_SIZE),
  };
}

export function CorrectSentence() {
  const { selectedProfileId } = useProfile();
  const [sentence, setSentence] = useState('');
  const [history, setHistory] = useState<SentenceAnalysis[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [fullById, setFullById] = useState<Record<string, SentenceAnalysis>>({});
  const [selectedSentenceId, setSelectedSentenceId] = useState<string | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<SentenceAnalysis | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const historyRef = useRef(history);
  historyRef.current = history;
  const fullByIdRef = useRef(fullById);
  fullByIdRef.current = fullById;
  const detailFetchGen = useRef(0);

  useEffect(() => {
    if (!selectedSentenceId) {
      setSelectedAnalysis(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    const gen = ++detailFetchGen.current;

    const cached = fullByIdRef.current[selectedSentenceId];
    if (cached && !cached.isHistorySummary) {
      if (import.meta.env.DEV) {
        console.debug('[sentence/detail] cache hit (no network)', { gen, id: selectedSentenceId });
      }
      setSelectedAnalysis(cached);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    const preview =
      cached ??
      historyRef.current.find((h) => h.id === selectedSentenceId) ??
      null;
    if (preview) {
      setSelectedAnalysis(preview);
    } else {
      setSelectedAnalysis(null);
    }
    const ac = new AbortController();
    setDetailLoading(true);
    setDetailError(null);

    const t0 = import.meta.env.DEV ? performance.now() : 0;

    fetchSentenceDetail(selectedSentenceId, ac.signal)
      .then((full) => {
        if (gen !== detailFetchGen.current) return;
        setSelectedAnalysis(full);
        setFullById((prev) => ({ ...prev, [selectedSentenceId]: full }));
        if (import.meta.env.DEV) {
          console.debug(
            `[sentence/detail] network+parse ${Math.round(performance.now() - t0)}ms (id=${selectedSentenceId})`
          );
        }
      })
      .catch((e) => {
        if (gen !== detailFetchGen.current) return;
        const aborted =
          (typeof e === 'object' &&
            e !== null &&
            'name' in e &&
            (e as { name: string }).name === 'AbortError') ||
          (e instanceof DOMException && e.name === 'AbortError');
        if (aborted) return;
        setDetailError(e instanceof Error ? e.message : 'Failed to load analysis');
      })
      .finally(() => {
        if (gen !== detailFetchGen.current) return;
        setDetailLoading(false);
      });

    return () => {
      ac.abort();
    };
  }, [selectedSentenceId]);

  const fetchHistoryPage = useCallback(async (page: number, mode: 'replace' | 'append') => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(HISTORY_PAGE_SIZE),
    });
    const headers = new Headers();
    if (selectedProfileId) {
      headers.set(PROFILE_ID_HEADER, selectedProfileId);
    }
    const res = await apiFetch(`${API_ROUTES.sentenceHistory}?${params}`, {
      method: 'GET',
      headers,
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(text || 'Invalid JSON from server');
    }
    if (!res.ok) {
      const msg =
        json && typeof json === 'object' && 'message' in json
          ? String((json as { message: unknown }).message)
          : text || res.statusText;
      throw new Error(msg);
    }
    const { items, total } = parseHistoryResponse(json);
    setHistoryTotal(total);
    if (mode === 'append') {
      setHistory((prev) => [...prev, ...items]);
    } else {
      setHistory(items);
    }
    return items;
  }, [selectedProfileId]);

  useEffect(() => {
    let cancelled = false;
    setSelectedSentenceId(null);
    setSelectedAnalysis(null);
    setFullById({});
    setHistory([]);
    setHistoryTotal(0);
    setHistoryLoading(true);
    setHistoryError(null);
    fetchHistoryPage(0, 'replace')
      .catch((e) => {
        if (!cancelled) {
          setHistoryError(e instanceof Error ? e.message : 'Failed to load history');
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchHistoryPage]);

  const canLoadMore = history.length < historyTotal;

  const loadMoreHistory = async () => {
    if (!canLoadMore || historyLoadingMore) return;
    const nextPage = Math.ceil(history.length / HISTORY_PAGE_SIZE);
    setHistoryLoadingMore(true);
    setHistoryError(null);
    try {
      await fetchHistoryPage(nextPage, 'append');
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Failed to load more');
    } finally {
      setHistoryLoadingMore(false);
    }
  };

  const analyzeSentence = async () => {
    if (!sentence.trim()) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const res = await apiFetch(API_ROUTES.correctSentence, {
        method: 'POST',
        body: JSON.stringify({ text: sentence.trim() }),
      });
      const text = await res.text();
      let json: unknown;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(text || 'Invalid JSON from server');
      }
      if (!res.ok) {
        const msg =
          json && typeof json === 'object' && 'message' in json
            ? String((json as { message: unknown }).message)
            : text || res.statusText;
        throw new Error(msg);
      }
      const payload = unwrapApiPayload(json) ?? (json as Record<string, unknown> | null);
      if (!payload) throw new Error('Empty response from server');

      const newAnalysis = parseSentenceAnalysis(payload, sentence.trim());
      setFullById((prev) => ({ ...prev, [newAnalysis.id]: newAnalysis }));
      setSelectedSentenceId(newAnalysis.id);
      setSentence('');
      try {
        await fetchHistoryPage(0, 'replace');
      } catch {
        /* list refresh failed; analysis still shown */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h2>Check Your Sentence</h2>
          </div>

          <Textarea
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            placeholder="Type or paste your sentence here..."
            className="min-h-[120px] rounded-xl border-2 border-gray-200 focus:border-blue-400 resize-none mb-4"
          />

          {error && (
            <p className="text-sm text-red-600 mb-3" role="alert">
              {error}
            </p>
          )}

          <Button
            onClick={analyzeSentence}
            disabled={!sentence.trim() || isAnalyzing}
            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl py-6 shadow-md hover:shadow-lg transition-all"
          >
            {isAnalyzing ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="mr-2"
                >
                  <Sparkles className="w-4 h-4" />
                </motion.div>
                Analyzing...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Analyze Sentence
              </>
            )}
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-lg p-6"
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />
              <h3>History</h3>
            </div>
            {historyTotal > 0 && (
              <span className="text-xs text-muted-foreground">
                {history.length} / {historyTotal}
              </span>
            )}
          </div>

          {historyError && (
            <p className="text-sm text-red-600 mb-3" role="alert">
              {historyError}
            </p>
          )}

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {historyLoading ? (
              <p className="text-sm text-muted-foreground text-center py-6">Loading history…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No analyses yet. Submit a sentence to build history.
              </p>
            ) : (
              <AnimatePresence>
                {history.map((item, index) => (
                  <motion.button
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => setSelectedSentenceId(item.id)}
                    className={`w-full text-left p-4 rounded-xl transition-all cursor-pointer ${
                      selectedSentenceId === item.id
                        ? 'bg-gradient-to-r from-blue-100 to-purple-100 border-2 border-blue-400 shadow-md'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                  >
                    <p className="text-sm text-gray-700 line-clamp-2">{item.original}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.timestamp.toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </motion.button>
                ))}
              </AnimatePresence>
            )}
          </div>

          {canLoadMore && !historyLoading && (
            <Button
              type="button"
              variant="outline"
              className="w-full mt-3 rounded-xl"
              disabled={historyLoadingMore}
              onClick={() => void loadMoreHistory()}
            >
              {historyLoadingMore ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl shadow-lg p-6"
      >
        {selectedSentenceId && !selectedAnalysis && detailLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="mb-3"
            >
              <Sparkles className="w-8 h-8 text-blue-400" />
            </motion.div>
            <p className="text-sm text-muted-foreground">Loading analysis…</p>
          </div>
        ) : selectedAnalysis ? (
          <div className="space-y-6 relative">
            {detailLoading && selectedAnalysis?.isHistorySummary && (
              <p className="text-xs text-muted-foreground">Fetching full details from server…</p>
            )}
            {detailError && (
              <p className="text-sm text-red-600" role="alert">
                {detailError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-blue-600">Analysis</h3>
              <Badge variant={selectedAnalysis.has_mistakes ? 'destructive' : 'secondary'}>
                {selectedAnalysis.has_mistakes ? 'Has mistakes' : 'No mistakes'}
              </Badge>
            </div>

            <div>
              <div className="mb-4 p-4 bg-red-50 rounded-xl border-2 border-red-200">
                <div className="flex items-start gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                  <span className="text-sm text-red-900">Original</span>
                </div>
                <p className="text-gray-800 ml-7">{selectedAnalysis.original}</p>
              </div>

              <div className="mb-4 p-4 bg-green-50 rounded-xl border-2 border-green-200">
                <div className="flex items-start gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <span className="text-sm text-green-900">Corrected</span>
                </div>
                <p className="text-gray-800 ml-7">{selectedAnalysis.corrected}</p>
              </div>

              {selectedAnalysis.natural.trim() !== '' && (
                <div className="p-4 bg-violet-50 rounded-xl border-2 border-violet-200">
                  <div className="flex items-start gap-2 mb-2">
                    <Sparkles className="w-5 h-5 text-violet-600 mt-0.5 shrink-0" />
                    <span className="text-sm text-violet-900">More natural</span>
                  </div>
                  <p className="text-gray-800 ml-7">{selectedAnalysis.natural}</p>
                </div>
              )}
            </div>

            {selectedAnalysis.tip.trim() !== '' && (
              <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <Lightbulb className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900 mb-1">Tip</p>
                  <p className="text-sm text-gray-800">{selectedAnalysis.tip}</p>
                </div>
              </div>
            )}

            <div>
              <h4 className="mb-3 text-red-600">Mistakes</h4>
              {selectedAnalysis.mistakes.length === 0 ? (
                <p className="text-sm text-muted-foreground">None listed.</p>
              ) : (
                <div className="space-y-3">
                  {selectedAnalysis.mistakes.map((m, index) => (
                    <motion.div
                      key={`${m.type}-${m.original}-${index}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="p-4 bg-red-50 rounded-xl border border-red-100 space-y-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {m.type.trim() !== '' && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {m.type}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-800">
                        <span className="text-red-700 line-through decoration-red-300">{m.original}</span>
                        {m.original && m.fix ? (
                          <span className="mx-2 text-muted-foreground" aria-hidden>
                            →
                          </span>
                        ) : null}
                        <span className="text-green-800 font-medium">{m.fix}</span>
                      </p>
                      {m.explanation.trim() !== '' && (
                        <p className="text-sm text-muted-foreground">{m.explanation}</p>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-3 text-blue-600">Improvements</h4>
              {selectedAnalysis.improvements.length === 0 ? (
                <p className="text-sm text-muted-foreground">None listed.</p>
              ) : (
                <div className="space-y-3">
                  {selectedAnalysis.improvements.map((imp, index) => (
                    <motion.div
                      key={`${imp.original_phrase}-${index}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-2"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-gray-700">{imp.original_phrase}</span>
                        <ArrowRight className="w-4 h-4 text-blue-500 shrink-0" />
                        <span className="font-medium text-blue-900">{imp.improved_phrase}</span>
                      </div>
                      {imp.explanation.trim() !== '' && (
                        <p className="text-sm text-muted-foreground">{imp.explanation}</p>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-gray-400 mb-2">No Analysis Yet</h3>
            <p className="text-sm text-muted-foreground">
              Select a history item or analyze a new sentence
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
