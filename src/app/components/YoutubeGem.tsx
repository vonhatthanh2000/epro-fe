import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Youtube,
  Play,
  Clock,
  BookOpen,
  Lightbulb,
  MessageSquare,
  TrendingUp,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  API_ROUTES,
  apiFetch,
  youtubeAnalysisDetailPath,
  unwrapApiPayload,
  withProfileId,
} from '../../config/api';
import { useProfile } from '../context/ProfileContext';

interface UsefulSentence {
  sentence: string;
  why_useful: string;
  grammar_pattern: string;
  usage_context: string;
}

interface GrammarPattern {
  pattern: string;
  example: string;
  usage: string;
}

interface EverydayPhrase {
  phrase: string;
  meaning: string;
  usage_context: string;
}

interface YoutubeAnalysis {
  id: string;
  video_title: string;
  video_url: string;
  transcript: string;
  useful_sentences: UsefulSentence[];
  grammar_patterns: GrammarPattern[];
  everyday_phrases: EverydayPhrase[];
  learning_tip: string;
  created_at: string;
}

interface YoutubeHistoryItem {
  id: string;
  video_title: string;
  video_url: string;
  created_at: string;
}

const HISTORY_PAGE_SIZE = 20;

// Component to highlight useful sentences in transcript
function TranscriptWithHighlights({
  transcript,
  usefulSentences,
}: {
  transcript: string;
  usefulSentences: UsefulSentence[];
}) {
  type Match = { start: number; end: number; index: number };

  const findMatches = (): Match[] => {
    const matches: Match[] = [];

    for (let i = 0; i < usefulSentences.length; i++) {
      const sentence = usefulSentences[i].sentence;
      if (!sentence || sentence.trim().length === 0) continue;

      // Strategy 1: Try exact substring match (case-insensitive)
      let pos = transcript.toLowerCase().indexOf(sentence.toLowerCase());
      let matchedLength = sentence.length;

      // Strategy 2: Try without trailing punctuation
      if (pos === -1) {
        const withoutTrailingPunct = sentence.replace(/[.,!?;:'"\u2018\u2019\u201C\u201D]+$/, '');
        pos = transcript.toLowerCase().indexOf(withoutTrailingPunct.toLowerCase());
        if (pos !== -1) matchedLength = withoutTrailingPunct.length;
      }

      // Strategy 3: Try without any punctuation
      if (pos === -1) {
        const withoutPunct = sentence.replace(/[.,!?;:'"\u2018\u2019\u201C\u201D]/g, '');
        const normalizedTranscript = transcript.replace(/[.,!?;:'"\u2018\u2019\u201C\u201D]/g, '');
        pos = normalizedTranscript.toLowerCase().indexOf(withoutPunct.toLowerCase());
        if (pos !== -1) {
          // Map position back to original transcript with punctuation
          let punctCount = 0;
          for (let j = 0; j < transcript.length && punctCount < pos; j++) {
            if (!/[.,!?;:'"\u2018\u2019\u201C\u201D]/.test(transcript[j])) {
              punctCount++;
            }
          }
          pos = punctCount;
          matchedLength = sentence.length;
        }
      }

      if (pos !== -1) {
        matches.push({ start: pos, end: pos + matchedLength, index: i });
      }
    }

    // Sort and remove overlaps
    matches.sort((a, b) => a.start - b.start);
    const result: Match[] = [];
    let lastEnd = 0;
    for (const m of matches) {
      if (m.start >= lastEnd) {
        result.push(m);
        lastEnd = m.end;
      }
    }
    return result;
  };

  const createSegments = (): Array<{ text: string; isHighlighted: boolean; index?: number }> => {
    const segments: Array<{ text: string; isHighlighted: boolean; index?: number }> = [];
    const matches = findMatches();

    if (matches.length === 0) {
      // No matches found, return entire transcript as single segment
      return [{ text: transcript, isHighlighted: false }];
    }

    let pos = 0;
    for (const match of matches) {
      if (match.start > pos) {
        segments.push({ text: transcript.slice(pos, match.start), isHighlighted: false });
      }
      segments.push({
        text: transcript.slice(match.start, match.end),
        isHighlighted: true,
        index: match.index,
      });
      pos = match.end;
    }

    if (pos < transcript.length) {
      segments.push({ text: transcript.slice(pos), isHighlighted: false });
    }

    return segments;
  };

  const segments = createSegments();

  return (
    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
      {segments.map((segment, idx) =>
        segment.isHighlighted ? (
          <mark
            key={idx}
            className="bg-amber-200 text-amber-900 px-1 rounded font-medium"
            title={`Useful sentence #${(segment.index ?? 0) + 1}`}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={idx}>{segment.text}</span>
        )
      )}
    </p>
  );
}

function parseYoutubeAnalysis(data: Record<string, unknown>): YoutubeAnalysis {
  return {
    id: String(data.id ?? ''),
    video_title: String(data.video_title ?? ''),
    video_url: String(data.video_url ?? ''),
    transcript: String(data.transcript ?? ''),
    useful_sentences: Array.isArray(data.useful_sentences)
      ? data.useful_sentences.map((s): UsefulSentence => {
          const item = s as Record<string, unknown>;
          return {
            sentence: String(item.sentence ?? ''),
            why_useful: String(item.why_useful ?? ''),
            grammar_pattern: String(item.grammar_pattern ?? ''),
            usage_context: String(item.usage_context ?? ''),
          };
        })
      : [],
    grammar_patterns: Array.isArray(data.grammar_patterns)
      ? data.grammar_patterns.map((g): GrammarPattern => {
          const item = g as Record<string, unknown>;
          return {
            pattern: String(item.pattern ?? ''),
            example: String(item.example ?? ''),
            usage: String(item.usage ?? ''),
          };
        })
      : [],
    everyday_phrases: Array.isArray(data.everyday_phrases)
      ? data.everyday_phrases.map((p): EverydayPhrase => {
          const item = p as Record<string, unknown>;
          return {
            phrase: String(item.phrase ?? ''),
            meaning: String(item.meaning ?? ''),
            usage_context: String(item.usage_context ?? ''),
          };
        })
      : [],
    learning_tip: String(data.learning_tip ?? ''),
    created_at: String(data.created_at ?? ''),
  };
}

function parseHistoryResponse(json: unknown): {
  items: YoutubeHistoryItem[];
  total: number;
} {
  const payload = unwrapApiPayload(json) ?? (json as Record<string, unknown> | null);
  if (!payload) {
    return { items: [], total: 0 };
  }
  const rawItems = payload.items;
  const items = Array.isArray(rawItems)
    ? rawItems
        .map((row): YoutubeHistoryItem | null => {
          if (!row || typeof row !== 'object') return null;
          const o = row as Record<string, unknown>;
          return {
            id: String(o.id ?? ''),
            video_title: String(o.video_title ?? ''),
            video_url: String(o.video_url ?? ''),
            created_at: String(o.created_at ?? ''),
          };
        })
        .filter((x): x is YoutubeHistoryItem => x != null)
    : [];
  return {
    items,
    total: Number(payload.total ?? 0),
  };
}

export function YoutubeGem() {
  const { selectedProfileId } = useProfile();
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<YoutubeAnalysis | null>(null);

  const [history, setHistory] = useState<YoutubeHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);

  const [showTranscript, setShowTranscript] = useState(false);

  const analysesFetchGen = useRef(0);

  // Load history
  const fetchHistory = useCallback(async () => {
    const params = new URLSearchParams({
      page: '0',
      page_size: String(HISTORY_PAGE_SIZE),
    });
    const res = await apiFetch(
      `${API_ROUTES.youtubeHistory}?${params}`,
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
    setHistory(items);
  }, [selectedProfileId]);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    fetchHistory()
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
  }, [fetchHistory]);

  // Fetch history detail
  const fetchHistoryDetail = async (analysisId: string) => {
    const gen = ++analysesFetchGen.current;
    setHistoryDetailLoading(true);

    try {
      const res = await apiFetch(
        youtubeAnalysisDetailPath(analysisId),
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
      if (!payload) throw new Error('Empty response from server');

      if (gen !== analysesFetchGen.current) return;

      const detail = parseYoutubeAnalysis(payload);
      setAnalysis(detail);
    } catch (e) {
      if (gen !== analysesFetchGen.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load analysis detail');
    } finally {
      if (gen === analysesFetchGen.current) {
        setHistoryDetailLoading(false);
      }
    }
  };

  // Handle history item click
  useEffect(() => {
    if (!selectedHistoryId) {
      setAnalysis(null);
      return;
    }
    void fetchHistoryDetail(selectedHistoryId);
  }, [selectedHistoryId]);

  const analyzeVideo = async () => {
    if (!url.trim()) return;

    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);

    try {
      const res = await apiFetch(
        API_ROUTES.youtubeAnalyze,
        withProfileId(selectedProfileId, {
          method: 'POST',
          body: JSON.stringify({ url: url.trim() }),
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

      const newAnalysis = parseYoutubeAnalysis(payload);
      setAnalysis(newAnalysis);
      setUrl('');

      // Refresh history
      try {
        await fetchHistory();
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to analyze video');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const isValidYoutubeUrl = (url: string): boolean => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return youtubeRegex.test(url);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
      <div className="space-y-6 xl:col-span-2">
        {/* URL Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Youtube className="w-4 h-4 text-white" />
            </div>
            <h2>Analyze YouTube Video</h2>
          </div>

          <div className="space-y-3">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste YouTube URL here..."
              className="rounded-xl border-2 border-gray-200 focus:border-red-400"
            />

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <Button
              onClick={analyzeVideo}
              disabled={!isValidYoutubeUrl(url) || isAnalyzing}
              className="w-full bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white rounded-xl py-6 shadow-md hover:shadow-lg transition-all"
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
                  Analyzing Video...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Analyze Video
                </>
              )}
            </Button>
          </div>
        </motion.div>

        {/* History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-lg p-6"
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-red-600" />
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
                No videos analyzed yet. Paste a YouTube URL to get started.
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
                    onClick={() => setSelectedHistoryId(item.id)}
                    className={`w-full text-left p-4 rounded-xl transition-all cursor-pointer ${
                      selectedHistoryId === item.id
                        ? 'bg-gradient-to-r from-red-100 to-pink-100 border-2 border-red-400 shadow-md'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                  >
                    <p className="text-sm text-gray-700 line-clamp-2 font-medium">{item.video_title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString([], {
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
        </motion.div>
      </div>

      {/* Analysis Detail */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl shadow-lg p-6 xl:col-span-3"
      >
        {selectedHistoryId && !analysis && historyDetailLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="mb-3"
            >
              <Sparkles className="w-8 h-8 text-red-400" />
            </motion.div>
            <p className="text-sm text-muted-foreground">Loading analysis…</p>
          </div>
        ) : analysis ? (
          <div className="space-y-6">
            {/* Video Info */}
            <div className="flex items-start gap-3 pb-4 border-b border-gray-200">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-500 rounded-lg flex items-center justify-center shrink-0">
                <Youtube className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 leading-tight">{analysis.video_title}</h3>
                <a
                  href={analysis.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1 mt-1"
                >
                  Watch on YouTube
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Learning Tip */}
            {analysis.learning_tip && (
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-amber-900 mb-1">Learning Tip</h4>
                    <p className="text-sm text-gray-700">{analysis.learning_tip}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Useful Sentences */}
            {analysis.useful_sentences.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  Useful Sentences ({analysis.useful_sentences.length})
                </h4>
                <div className="space-y-3">
                  {analysis.useful_sentences.map((item, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="p-4 bg-blue-50 rounded-xl border border-blue-200"
                    >
                      <p className="text-sm font-medium text-gray-900 mb-2">&ldquo;{item.sentence}&rdquo;</p>
                      <div className="space-y-1.5 text-xs">
                        <p className="text-gray-600">
                          <span className="font-medium text-blue-700">Why useful:</span> {item.why_useful}
                        </p>
                        <p className="text-gray-600">
                          <span className="font-medium text-blue-700">Grammar:</span> {item.grammar_pattern}
                        </p>
                        <p className="text-gray-600">
                          <span className="font-medium text-blue-700">Usage:</span> {item.usage_context}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Grammar Patterns */}
            {analysis.grammar_patterns.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                  Grammar Patterns ({analysis.grammar_patterns.length})
                </h4>
                <div className="space-y-2">
                  {analysis.grammar_patterns.map((item, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="p-3 bg-indigo-50 rounded-lg border border-indigo-200"
                    >
                      <Badge variant="secondary" className="mb-2 bg-indigo-100 text-indigo-700">
                        {item.pattern}
                      </Badge>
                      <p className="text-sm text-gray-700 italic mb-1">&ldquo;{item.example}&rdquo;</p>
                      <p className="text-xs text-gray-600">{item.usage}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Everyday Phrases */}
            {analysis.everyday_phrases.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  Everyday Phrases ({analysis.everyday_phrases.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {analysis.everyday_phrases.map((item, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className="p-3 bg-green-50 rounded-lg border border-green-200"
                    >
                      <p className="text-sm font-medium text-gray-900 mb-1">&ldquo;{item.phrase}&rdquo;</p>
                      <p className="text-xs text-gray-600 mb-1">{item.meaning}</p>
                      <p className="text-xs text-green-700">{item.usage_context}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Transcript */}
            {analysis.transcript && (
              <div>
                <button
                  onClick={() => setShowTranscript(!showTranscript)}
                  className="w-full flex items-center justify-between p-3 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    Full Transcript
                    <span className="text-xs text-muted-foreground font-normal">
                      (useful sentences highlighted)
                    </span>
                  </span>
                  {showTranscript ? (
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  )}
                </button>
                <AnimatePresence>
                  {showTranscript && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <TranscriptWithHighlights
                          transcript={analysis.transcript}
                          usefulSentences={analysis.useful_sentences}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <Youtube className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-gray-400 mb-2">No Video Analyzed</h3>
            <p className="text-sm text-muted-foreground">
              Paste a YouTube URL or select from history to see the analysis
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
