import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  CheckCircle,
  AlertCircle,
  Sparkles,
  History,
  Lightbulb,
  ArrowRight,
  FileSearch,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import {
  API_ROUTES,
  apiFetch,
  sentenceDetailPath,
  sentenceAnalysesPath,
  sentenceAnalysisDetailPath,
  unwrapApiPayload,
  withProfileId,
} from '../../config/api';
import { useProfile } from '../context/ProfileContext';
import { cn } from './ui/utils';

type DetailTab = 'analysis' | 'mistakes' | 'improvements';

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
  /** Indicates if the sentence has been batch analyzed for summary review */
  analyzed?: boolean;
  /** From GET /sentence/history — mistakes/improvements/tip not included. */
  isHistorySummary?: boolean;
}

interface BatchAnalysisItem {
  id: string;
  content: string;
  created_at: string;
}

interface BatchAnalysisDetail extends BatchAnalysisItem {
  content: string;
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
    analyzed: Boolean(data.analyzed),
    isHistorySummary: false,
  };
}

async function fetchSentenceDetail(
  sentenceId: string,
  profileId: string | null | undefined,
  signal?: AbortSignal
): Promise<SentenceAnalysis> {
  const res = await apiFetch(
    sentenceDetailPath(sentenceId),
    withProfileId(profileId, { method: 'GET', signal })
  );
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
    analyzed: Boolean(row.analyzed),
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
  const [detailTab, setDetailTab] = useState<DetailTab>('analysis');
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [batchAnalysisError, setBatchAnalysisError] = useState<string | null>(null);
  const [batchAnalysisResult, setBatchAnalysisResult] = useState<string | null>(null);

  // Analyses list state
  const [analyses, setAnalyses] = useState<BatchAnalysisItem[]>([]);
  const [analysesTotal, setAnalysesTotal] = useState(0);
  const [analysesLoading, setAnalysesLoading] = useState(false);
  const [analysesError, setAnalysesError] = useState<string | null>(null);
  const [selectedBatchAnalysisId, setSelectedBatchAnalysisId] = useState<string | null>(null);
  const [selectedBatchAnalysis, setSelectedBatchAnalysis] = useState<BatchAnalysisDetail | null>(null);
  const [batchAnalysisDetailLoading, setBatchAnalysisDetailLoading] = useState(false);
  const [batchAnalysisDetailError, setBatchAnalysisDetailError] = useState<string | null>(null);
  const [analysesPage, setAnalysesPage] = useState(0);
  const [analysesLoadingMore, setAnalysesLoadingMore] = useState(false);

  const historyRef = useRef(history);
  historyRef.current = history;
  const fullByIdRef = useRef(fullById);
  fullByIdRef.current = fullById;
  const detailFetchGen = useRef(0);
  const analysesFetchGen = useRef(0);

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

    fetchSentenceDetail(selectedSentenceId, selectedProfileId, ac.signal)
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
  }, [selectedSentenceId, selectedProfileId]);

  useEffect(() => {
    if (selectedAnalysis) {
      setDetailTab('analysis');
    }
  }, [selectedAnalysis?.id]);

  // Fetch batch analysis detail when selected
  useEffect(() => {
    if (!selectedBatchAnalysisId) {
      setSelectedBatchAnalysis(null);
      setBatchAnalysisDetailLoading(false);
      setBatchAnalysisDetailError(null);
      return;
    }

    // Check if already cached in analyses list
    const cached = analyses.find((a) => a.id === selectedBatchAnalysisId);
    if (cached) {
      setSelectedBatchAnalysis(cached as BatchAnalysisDetail);
    } else {
      setSelectedBatchAnalysis(null);
    }

    void fetchBatchAnalysisDetail(selectedBatchAnalysisId);
  }, [selectedBatchAnalysisId, selectedProfileId]);

  const fetchHistoryPage = useCallback(async (page: number, mode: 'replace' | 'append') => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(HISTORY_PAGE_SIZE),
    });
    const res = await apiFetch(
      `${API_ROUTES.sentenceHistory}?${params}`,
      withProfileId(selectedProfileId, { method: 'GET' })
    );
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

  // Analyses fetch functions
  const fetchAnalysesPage = useCallback(async (page: number, mode: 'replace' | 'append') => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(HISTORY_PAGE_SIZE),
    });
    const res = await apiFetch(
      `${sentenceAnalysesPath()}?${params}`,
      withProfileId(selectedProfileId, { method: 'GET' })
    );
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
    if (!payload) {
      return { items: [], total: 0 };
    }
    const rawItems = payload.items ?? payload.analyses ?? payload.data;
    const items = Array.isArray(rawItems)
      ? rawItems
          .map((row): BatchAnalysisItem | null => {
            if (!row || typeof row !== 'object') return null;
            const o = row as Record<string, unknown>;
            const content = String(o.content ?? '');
            // Skip error responses like {"detail":"Not Found"}
            if (content.includes('"detail"') || content === '{}' || content === '') return null;
            return {
              id: String(o.id ?? ''),
              content,
              created_at: String(o.created_at ?? ''),
            };
          })
          .filter((x): x is BatchAnalysisItem => x != null)
      : [];
    const total = Number(payload.total ?? payload.count ?? items.length);
    setAnalysesTotal(total);
    if (mode === 'append') {
      setAnalyses((prev) => [...prev, ...items]);
    } else {
      setAnalyses(items);
    }
    return { items, total };
  }, [selectedProfileId]);

  const loadMoreAnalyses = async () => {
    if (analyses.length >= analysesTotal || analysesLoadingMore) return;
    const nextPage = analysesPage + 1;
    setAnalysesLoadingMore(true);
    setAnalysesError(null);
    try {
      await fetchAnalysesPage(nextPage, 'append');
      setAnalysesPage(nextPage);
    } catch (e) {
      setAnalysesError(e instanceof Error ? e.message : 'Failed to load more analyses');
    } finally {
      setAnalysesLoadingMore(false);
    }
  };

  const fetchBatchAnalysisDetail = async (analysisId: string) => {
    const gen = ++analysesFetchGen.current;
    const ac = new AbortController();
    setBatchAnalysisDetailLoading(true);
    setBatchAnalysisDetailError(null);

    try {
      const res = await apiFetch(
        sentenceAnalysisDetailPath(analysisId),
        withProfileId(selectedProfileId, { method: 'GET', signal: ac.signal })
      );
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

      if (gen !== analysesFetchGen.current) return;

      const detail: BatchAnalysisDetail = {
        id: String(payload.id ?? analysisId),
        content: String(payload.content ?? ''),
        created_at: String(payload.created_at ?? ''),
      };

      setSelectedBatchAnalysis(detail);
    } catch (e) {
      if (gen !== analysesFetchGen.current) return;
      const aborted =
        (typeof e === 'object' &&
          e !== null &&
          'name' in e &&
          (e as { name: string }).name === 'AbortError') ||
        (e instanceof DOMException && e.name === 'AbortError');
      if (!aborted) {
        setBatchAnalysisDetailError(e instanceof Error ? e.message : 'Failed to load analysis detail');
      }
    } finally {
      if (gen === analysesFetchGen.current) {
        setBatchAnalysisDetailLoading(false);
      }
    }

    return () => {
      ac.abort();
    };
  };

  // Load analyses when tab is active (initially or on profile change)
  const loadAnalyses = useCallback(async () => {
    setAnalysesLoading(true);
    setAnalysesError(null);
    setAnalysesPage(0);
    try {
      await fetchAnalysesPage(0, 'replace');
    } catch (e) {
      setAnalysesError(e instanceof Error ? e.message : 'Failed to load analyses');
    } finally {
      setAnalysesLoading(false);
    }
  }, [fetchAnalysesPage]);

  // Initial load of analyses
  useEffect(() => {
    let cancelled = false;
    setAnalyses([]);
    setAnalysesTotal(0);
    setAnalysesPage(0);
    setAnalysesLoading(true);
    setAnalysesError(null);
    fetchAnalysesPage(0, 'replace')
      .catch((e) => {
        if (!cancelled) {
          setAnalysesError(e instanceof Error ? e.message : 'Failed to load analyses');
        }
      })
      .finally(() => {
        if (!cancelled) setAnalysesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAnalysesPage]);

  const analyzeSentence = async () => {
    if (!sentence.trim()) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const res = await apiFetch(
        API_ROUTES.correctSentence,
        withProfileId(selectedProfileId, {
          method: 'POST',
          body: JSON.stringify({ text: sentence.trim() }),
        })
      );
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

  const analyzeBatchSentences = async () => {
    if (history.length === 0) return;

    setIsBatchAnalyzing(true);
    setBatchAnalysisError(null);
    setBatchAnalysisResult(null);

    try {
      const res = await apiFetch(
        API_ROUTES.analyzeSentences,
        withProfileId(selectedProfileId, {
          method: 'POST',
          body: JSON.stringify({}),
        })
      );
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

      // Extract summary from response
      const summary = payload.summary ?? payload.analysis ?? payload.result ?? payload;
      if (typeof summary === 'string') {
        setBatchAnalysisResult(summary);
      } else if (summary && typeof summary === 'object') {
        setBatchAnalysisResult(JSON.stringify(summary, null, 2));
      } else {
        setBatchAnalysisResult('Analysis completed successfully.');
      }

      // Refresh history to get updated analyzed status
      try {
        await fetchHistoryPage(0, 'replace');
      } catch {
        /* list refresh failed; analysis still shown */
      }

      // Refresh analyses list
      try {
        await fetchAnalysesPage(0, 'replace');
        setAnalysesPage(0);
      } catch {
        /* analyses refresh failed */
      }
    } catch (e) {
      setBatchAnalysisError(e instanceof Error ? e.message : 'Batch analysis failed');
    } finally {
      setIsBatchAnalyzing(false);
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
            <div className="flex items-center gap-2">
              {historyTotal > 0 && (
                <span className="text-xs text-muted-foreground">
                  {history.length} / {historyTotal}
                </span>
              )}
              <Button
                onClick={analyzeBatchSentences}
                disabled={history.length === 0 || isBatchAnalyzing}
                variant="outline"
                size="sm"
                className="rounded-lg border-blue-200 hover:bg-blue-50 hover:border-blue-300"
              >
                {isBatchAnalyzing ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="mr-1.5"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </motion.div>
                ) : (
                  <BarChart3 className="w-4 h-4 mr-1.5" />
                )}
                {isBatchAnalyzing ? 'Analyzing...' : 'Analyze All'}
              </Button>
            </div>
          </div>

          {batchAnalysisError && (
            <p className="text-sm text-red-600 mb-3" role="alert">
              {batchAnalysisError}
            </p>
          )}

          {batchAnalysisResult && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 bg-indigo-50 rounded-xl border border-indigo-200"
            >
              <div className="flex items-start gap-2 mb-2">
                <BarChart3 className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
                <span className="text-sm font-medium text-indigo-900">Batch Analysis Summary</span>
              </div>
              <pre className="text-xs text-gray-700 ml-7 whitespace-pre-wrap font-mono bg-white/50 p-2 rounded-lg">
                {batchAnalysisResult}
              </pre>
            </motion.div>
          )}

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
                    onClick={() => {
                      setSelectedBatchAnalysisId(null);
                      setSelectedBatchAnalysis(null);
                      setSelectedSentenceId(item.id);
                    }}
                    className={`w-full text-left p-4 rounded-xl transition-all cursor-pointer ${
                      selectedSentenceId === item.id
                        ? 'bg-gradient-to-r from-blue-100 to-purple-100 border-2 border-blue-400 shadow-md'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-gray-700 line-clamp-2 flex-1">
                        {item.original}
                      </p>
                      {item.analyzed && (
                        <div className="flex items-center gap-1 shrink-0 bg-blue-500 text-white px-2 py-1 rounded-full">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span className="text-[10px] font-semibold">Analyzed</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-muted-foreground">
                        {item.timestamp.toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
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

        {/* Batch Analyses List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl shadow-lg p-6"
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <h3>Analysis Summaries</h3>
            </div>
            <div className="flex items-center gap-2">
              {analysesTotal > 0 && (
                <span className="text-xs text-muted-foreground">
                  {analyses.length} / {analysesTotal}
                </span>
              )}
              <Button
                onClick={loadAnalyses}
                variant="ghost"
                size="sm"
                disabled={analysesLoading}
                className="rounded-lg"
              >
                {analysesLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <BarChart3 className="w-4 h-4" />
                  </motion.div>
                ) : (
                  <BarChart3 className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {analysesError && (
            <p className="text-sm text-red-600 mb-3" role="alert">
              {analysesError}
            </p>
          )}

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
            {analysesLoading && analyses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Loading analyses…</p>
            ) : analyses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No analysis summaries yet. Click &quot;Analyze All&quot; to create one.
              </p>
            ) : (
              <AnimatePresence>
                {analyses.map((item, index) => (
                  <motion.button
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => {
                      setSelectedSentenceId(null);
                      setSelectedAnalysis(null);
                      setSelectedBatchAnalysisId(item.id);
                    }}
                    className={`w-full text-left p-4 rounded-xl transition-all cursor-pointer ${
                      selectedBatchAnalysisId === item.id
                        ? 'bg-gradient-to-r from-indigo-100 to-purple-100 border-2 border-indigo-400 shadow-md'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                  >
                    <p className="text-sm text-gray-700 line-clamp-2 font-medium">
                      {item.content.split('\n')[0].replace(/^#+\s*/, '').slice(0, 100)}
                      {item.content.length > 100 ? '...' : ''}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <Badge variant="outline" className="text-[10px] text-indigo-600 border-indigo-200">
                        Markdown
                      </Badge>
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            )}
          </div>

          {analyses.length < analysesTotal && !analysesLoading && (
            <Button
              type="button"
              variant="outline"
              className="w-full mt-3 rounded-xl"
              disabled={analysesLoadingMore}
              onClick={() => void loadMoreAnalyses()}
            >
              {analysesLoadingMore ? 'Loading…' : 'Load more'}
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
        {selectedBatchAnalysisId && !selectedBatchAnalysis && batchAnalysisDetailLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="mb-3"
            >
              <BarChart3 className="w-8 h-8 text-indigo-400" />
            </motion.div>
            <p className="text-sm text-muted-foreground">Loading analysis summary…</p>
          </div>
        ) : selectedBatchAnalysis ? (
          <div className="space-y-4 relative">
            {batchAnalysisDetailLoading && (
              <p className="text-xs text-muted-foreground">Fetching full details from server…</p>
            )}
            {batchAnalysisDetailError && (
              <p className="text-sm text-red-600" role="alert">
                {batchAnalysisDetailError}
              </p>
            )}

            <h3 className="text-lg font-semibold text-gray-900">Analysis Summary</h3>

            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-medium text-indigo-900">Generated Analysis</span>
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                {new Date(selectedBatchAnalysis.created_at).toLocaleString()}
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-gray-200 prose prose-sm max-w-none">
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 className="text-xl font-bold text-gray-900 mb-4">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-semibold text-gray-800 mb-3 mt-4">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-base font-medium text-gray-700 mb-2 mt-3">{children}</h3>,
                  p: ({ children }) => <p className="text-sm text-gray-700 mb-2 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc list-inside mb-3 text-sm text-gray-700">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside mb-3 text-sm text-gray-700">{children}</ol>,
                  li: ({ children }) => <li className="mb-1">{children}</li>,
                  code: ({ children }) => (
                    <code className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                  ),
                  pre: ({ children }) => (
                    <pre className="bg-gray-100 p-3 rounded-lg overflow-x-auto mb-3">{children}</pre>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-indigo-300 pl-3 italic text-gray-600 mb-3">{children}</blockquote>
                  ),
                  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                  em: ({ children }) => <em className="italic text-gray-700">{children}</em>,
                  table: ({ children }) => (
                    <table className="w-full border-collapse mb-3 text-sm">{children}</table>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-gray-100">{children}</thead>
                  ),
                  tbody: ({ children }) => (
                    <tbody>{children}</tbody>
                  ),
                  tr: ({ children }) => (
                    <tr className="border-b border-gray-200">{children}</tr>
                  ),
                  th: ({ children }) => (
                    <th className="text-left px-3 py-2 font-semibold text-gray-800">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="px-3 py-2 text-gray-700">{children}</td>
                  ),
                }}
              >
                {selectedBatchAnalysis.content}
              </Markdown>
            </div>
          </div>
        ) : selectedSentenceId && !selectedAnalysis && detailLoading ? (
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
          <div className="space-y-4 relative">
            {detailLoading && selectedAnalysis?.isHistorySummary && (
              <p className="text-xs text-muted-foreground">Fetching full details from server…</p>
            )}
            {detailError && (
              <p className="text-sm text-red-600" role="alert">
                {detailError}
              </p>
            )}

            <div
              className="flex flex-wrap gap-1.5 rounded-xl bg-gray-100/90 p-1.5"
              role="tablist"
              aria-label="Analysis sections"
            >
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'analysis'}
                id="detail-tab-analysis"
                aria-controls="detail-panel-analysis"
                onClick={() => setDetailTab('analysis')}
                className={cn(
                  'inline-flex flex-1 min-w-[6.5rem] items-center justify-center gap-2 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-all',
                  detailTab === 'analysis'
                    ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-200/70'
                    : 'text-muted-foreground hover:bg-white/60 hover:text-gray-800'
                )}
              >
                <FileSearch className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
                Analysis
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'mistakes'}
                id="detail-tab-mistakes"
                aria-controls="detail-panel-mistakes"
                onClick={() => setDetailTab('mistakes')}
                className={cn(
                  'inline-flex flex-1 min-w-[6.5rem] items-center justify-center gap-2 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-all',
                  detailTab === 'mistakes'
                    ? 'bg-white text-red-700 shadow-sm ring-1 ring-red-200/70'
                    : 'text-muted-foreground hover:bg-white/60 hover:text-gray-800'
                )}
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" aria-hidden />
                <span className="truncate">Mistakes</span>
                {selectedAnalysis.mistakes.length > 0 && (
                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-red-700 tabular-nums">
                    {selectedAnalysis.mistakes.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'improvements'}
                id="detail-tab-improvements"
                aria-controls="detail-panel-improvements"
                onClick={() => setDetailTab('improvements')}
                className={cn(
                  'inline-flex flex-1 min-w-[6.5rem] items-center justify-center gap-2 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-all',
                  detailTab === 'improvements'
                    ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200/70'
                    : 'text-muted-foreground hover:bg-white/60 hover:text-gray-800'
                )}
              >
                <TrendingUp className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                <span className="truncate text-left leading-tight">Improvements</span>
                {selectedAnalysis.improvements.length > 0 && (
                  <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-indigo-800 tabular-nums">
                    {selectedAnalysis.improvements.length}
                  </span>
                )}
              </button>
            </div>

            <AnimatePresence mode="wait">
              {detailTab === 'analysis' && (
                <motion.div
                  key="analysis"
                  role="tabpanel"
                  id="detail-panel-analysis"
                  aria-labelledby="detail-tab-analysis"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-4 min-h-[120px]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={selectedAnalysis.has_mistakes ? 'destructive' : 'secondary'}>
                      {selectedAnalysis.has_mistakes ? 'Has mistakes' : 'No mistakes'}
                    </Badge>
                  </div>

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

                  {selectedAnalysis.tip.trim() !== '' && (
                    <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                      <Lightbulb className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-900 mb-1">Tip</p>
                        <p className="text-sm text-gray-800">{selectedAnalysis.tip}</p>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {detailTab === 'mistakes' && (
                <motion.div
                  key="mistakes"
                  role="tabpanel"
                  id="detail-panel-mistakes"
                  aria-labelledby="detail-tab-mistakes"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="min-h-[120px]"
                >
                  {selectedAnalysis.mistakes.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">None listed.</p>
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
                </motion.div>
              )}

              {detailTab === 'improvements' && (
                <motion.div
                  key="improvements"
                  role="tabpanel"
                  id="detail-panel-improvements"
                  aria-labelledby="detail-tab-improvements"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="min-h-[120px]"
                >
                  {selectedAnalysis.improvements.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">None listed.</p>
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-gray-400 mb-2">No Analysis Selected</h3>
            <p className="text-sm text-muted-foreground">
              Select a history item, analysis summary, or analyze a new sentence
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
