import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
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
  ChevronRight,
  Mic,
  Square,
  Volume2,
  Headphones,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import {
  API_ROUTES,
  apiFetch,
  youtubeAnalysisDetailPath,
  unwrapApiPayload,
  withProfileId,
  submitShadowingAttempt,
  getShadowingDetail,
  type ShadowingAttemptResponse,
  type ShadowingStatsResponse,
  getShadowingStats,
  type TranscriptSegment,
} from '../../config/api';
import { useProfile } from '../context/ProfileContext';
import { useAudioRecorder } from '../hooks/useAudioRecorder';

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
  /** Ordered timed lines for shadowing / seek; empty → fall back to splitting `transcript`. */
  transcript_segments: TranscriptSegment[];
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

function parseTranscriptSegments(raw: unknown): TranscriptSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: TranscriptSegment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const text = String(o.text ?? '').trim();
    if (!text) continue;
    const start = Number(o.start_time);
    const end = Number(o.end_time);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    out.push({ text, start_time: start, end_time: end });
  }
  return out;
}

/** Fallback when `transcript_segments` is empty: split plain transcript (no seek times). */
function splitTranscriptIntoSentences(transcript: string): string[] {
  return transcript
    .replace(/([.!?])(\s+)(?=[A-Z])/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

type ShadowingLine = {
  text: string;
  startTime: number | null;
  endTime: number | null;
};

/** Lines for shadowing: API segments when present, else heuristic split of `transcript`. */
function buildShadowingPlan(analysis: YoutubeAnalysis): ShadowingLine[] {
  if (analysis.transcript_segments.length > 0) {
    return analysis.transcript_segments.map((s) => ({
      text: s.text,
      startTime: s.start_time,
      endTime: s.end_time,
    }));
  }
  return splitTranscriptIntoSentences(analysis.transcript).map((text) => ({
    text,
    startTime: null,
    endTime: null,
  }));
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
    /youtube\.com\/shorts\/([^&\s?]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function parseYoutubeAnalysis(data: Record<string, unknown>): YoutubeAnalysis {
  // Try multiple possible ID field names from backend
  const id = String(
    data.id ??
    data._id ??
    data.uuid ??
    data.analysis_id ??
    ''
  );

  return {
    id,
    video_title: String(data.video_title ?? ''),
    video_url: String(data.video_url ?? ''),
    transcript: String(data.transcript ?? ''),
    transcript_segments: parseTranscriptSegments(data.transcript_segments),
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

          // Try multiple ID field names
          const id = String(
            o.id ??
            o._id ??
            o.uuid ??
            o.analysis_id ??
            ''
          );

          return {
            id,
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
  const [showEmbed, setShowEmbed] = useState(false);
  const [isShadowingMode, setIsShadowingMode] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [sentenceRecordings, setSentenceRecordings] = useState<Map<number, { audioUrl: string; duration: number }>>(new Map());
  const [shadowingError, setShadowingError] = useState<string | null>(null);

  // Shadowing API integration state
  const [shadowingAttempts, setShadowingAttempts] = useState<Map<number, ShadowingAttemptResponse>>(new Map());
  const [shadowingStats, setShadowingStats] = useState<ShadowingStatsResponse | null>(null);
  /** Sentence index currently being evaluated (upload + API), or null */
  const [submittingSentenceIndex, setSubmittingSentenceIndex] = useState<number | null>(null);
  /** Which sentence row shows the expanded AI evaluation panel */
  const [evaluationExpandedIndex, setEvaluationExpandedIndex] = useState<number | null>(null);

  // Audio recorder for shadowing
  const {
    isRecording,
    duration: recordingDuration,
    startRecording,
    stopRecording,
    reset: resetRecorder,
    error: recorderError,
  } = useAudioRecorder();

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

      // Backend doesn't return 'id' in detail, so inject it from the URL param
      const detailWithId = { ...payload, id: analysisId };
      const detail = parseYoutubeAnalysis(detailWithId);
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

  const shadowingPlan = useMemo(
    () => (analysis ? buildShadowingPlan(analysis) : []),
    [analysis]
  );

  const shadowingVideoEmbedSrc = useMemo(() => {
    if (!analysis) return '';
    const vid = extractVideoId(analysis.video_url);
    if (!vid) return '';
    const line = shadowingPlan[currentSentenceIndex];
    const params = new URLSearchParams({ rel: '0', modestbranding: '1' });
    if (
      line &&
      line.startTime != null &&
      Number.isFinite(line.startTime) &&
      line.startTime >= 0
    ) {
      params.set('start', String(Math.floor(line.startTime)));
      if (
        line.endTime != null &&
        Number.isFinite(line.endTime) &&
        line.endTime > line.startTime
      ) {
        params.set('end', String(Math.ceil(line.endTime)));
      }
    }
    return `https://www.youtube.com/embed/${vid}?${params.toString()}`;
  }, [analysis, shadowingPlan, currentSentenceIndex]);

  /** Sentences with a stored score: from API stats and/or in-memory attempts (stats alone after reload). */
  const shadowingProgressCounts = useMemo(() => {
    if (!analysis) return { total: 0, evaluated: 0 };
    const total = shadowingPlan.length;
    if (total === 0) return { total: 0, evaluated: 0 };
    const indices = new Set<number>();
    shadowingStats?.progress_by_sentence.forEach((p) => {
      const i = p.sentence_index;
      if (typeof i === 'number' && Number.isFinite(i) && i >= 0 && i < total) indices.add(i);
    });
    shadowingAttempts.forEach((_, idx) => {
      if (idx >= 0 && idx < total) indices.add(idx);
    });
    return { total, evaluated: indices.size };
  }, [analysis, shadowingStats, shadowingAttempts, shadowingPlan]);

  const loadShadowingStats = useCallback(async () => {
    if (!analysis) return;
    try {
      const stats = await getShadowingStats(analysis.id);
      setShadowingStats(stats);
    } catch {
      /* ignore */
    }
  }, [analysis]);

  const exitShadowing = useCallback(() => {
    setIsShadowingMode(false);
    setCurrentSentenceIndex(0);
    setShadowingError(null);
    setEvaluationExpandedIndex(null);
    setSubmittingSentenceIndex(null);
    setSentenceRecordings(new Map());
    setShadowingAttempts(new Map());
    setShadowingStats(null);
  }, []);

  const enterShadowing = useCallback(() => {
    setIsShadowingMode(true);
    setShowTranscript(true);
    setCurrentSentenceIndex(0);
    setShadowingError(null);
    setEvaluationExpandedIndex(null);
    setSubmittingSentenceIndex(null);
    if (analysis) void loadShadowingStats();
  }, [analysis, loadShadowingStats]);

  const handleShadowingToggle = () => {
    if (isShadowingMode) exitShadowing();
    else enterShadowing();
  };

  const handleSentenceRecord = async (sentenceIndex: number) => {
    if (isRecording) {
      // Stop recording
      const audioFile = await stopRecording();
      if (audioFile && analysis) {
        // Create local URL for immediate playback
        const audioUrl = URL.createObjectURL(audioFile);
        setSentenceRecordings((prev) => {
          const newMap = new Map(prev);
          newMap.set(sentenceIndex, { audioUrl, duration: recordingDuration });
          return newMap;
        });

        setSubmittingSentenceIndex(sentenceIndex);
        setShadowingError(null);

        try {
          const line = shadowingPlan[sentenceIndex];
          if (!line) {
            setShadowingError('This sentence is not available for shadowing.');
            return;
          }
          const targetSentence = line.text;

          const attempt = await submitShadowingAttempt(
            audioFile,
            analysis.id,
            targetSentence,
            sentenceIndex,
            recordingDuration
          );

          setShadowingAttempts((prev) => {
            const newMap = new Map(prev);
            newMap.set(sentenceIndex, attempt);
            return newMap;
          });

          setEvaluationExpandedIndex(sentenceIndex);

          void loadShadowingStats();
        } catch (err) {
          setShadowingError(err instanceof Error ? err.message : 'Failed to evaluate shadowing attempt');
        } finally {
          setSubmittingSentenceIndex(null);
        }
      }
    } else {
      // Align "current" row with the sentence being recorded (fixes Re-record when focus was on next sentence)
      setCurrentSentenceIndex(sentenceIndex);
      setShadowingError(null);
      await startRecording();
    }
  };

  // Load stats when entering shadowing mode or when analysis changes
  useEffect(() => {
    if (isShadowingMode && analysis) {
      void loadShadowingStats();
    }
  }, [isShadowingMode, analysis, loadShadowingStats]);

  /** Focus a line for video seek (timed segments) + highlight; does not start recording. */
  const focusShadowingSentence = useCallback(
    (index: number) => {
      if (isRecording) return;
      setCurrentSentenceIndex(index);
      setEvaluationExpandedIndex((e) => (e === index ? e : null));
    },
    [isRecording]
  );

  // Helper to get best score from stats for a sentence
  const getBestScoreFromStats = (sentenceIndex: number): number | null => {
    if (!shadowingStats) return null;
    const progress = shadowingStats.progress_by_sentence.find(
      p => p.sentence_index === sentenceIndex
    );
    return progress?.best_score ?? null;
  };

  // Helper to load shadowing detail by constructing composite ID
  const handleViewShadowingDetail = async (sentenceIndex: number) => {
    const localAttempt = shadowingAttempts.get(sentenceIndex);
    if (localAttempt) {
      setEvaluationExpandedIndex(sentenceIndex);
      return;
    }

    if (!analysis || !selectedProfileId) return;

    const compositeId = `${selectedProfileId}:${analysis.id}:${sentenceIndex}`;

    setSubmittingSentenceIndex(sentenceIndex);
    try {
      const attempt = await getShadowingDetail(compositeId);
      setShadowingAttempts(prev => {
        const newMap = new Map(prev);
        newMap.set(sentenceIndex, attempt);
        return newMap;
      });
      setEvaluationExpandedIndex(sentenceIndex);
    } catch (err) {
      console.error('Failed to load shadowing detail:', err);
      setShadowingError('Failed to load evaluation details');
    } finally {
      setSubmittingSentenceIndex(null);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
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

            {/* YouTube Embed (hidden in shadowing — player is in left column) */}
            {extractVideoId(analysis.video_url) && !isShadowingMode && (
              <div>
                <button
                  onClick={() => setShowEmbed(!showEmbed)}
                  className="w-full flex items-center justify-between p-3 bg-red-50 rounded-xl hover:bg-red-100 transition-colors border border-red-200"
                >
                  <span className="text-sm font-medium text-red-800 flex items-center gap-2">
                    <Play className="w-4 h-4" />
                    {showEmbed ? 'Hide Video Player' : 'Watch Video Here'}
                  </span>
                  {showEmbed ? (
                    <ChevronUp className="w-4 h-4 text-red-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-red-600" />
                  )}
                </button>

                <AnimatePresence>
                  {showEmbed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 relative w-full aspect-video rounded-xl overflow-hidden bg-black shadow-lg">
                        <iframe
                          src={`https://www.youtube.com/embed/${extractVideoId(analysis.video_url)}?rel=0&modestbranding=1`}
                          title={analysis.video_title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="absolute inset-0 w-full h-full"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

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

            {/* Transcript with Shadowing */}
            {analysis.transcript && (
              <div>
                <div className="flex items-center justify-between p-3 bg-gray-100 rounded-xl mb-2">
                  <button
                    onClick={() => setShowTranscript(!showTranscript)}
                    className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity"
                  >
                    <BookOpen className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700">
                      Full Transcript
                    </span>
                    <span className="text-xs text-muted-foreground font-normal">
                      (useful sentences highlighted)
                    </span>
                    {showTranscript ? (
                      <ChevronUp className="w-4 h-4 text-gray-500 ml-2" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500 ml-2" />
                    )}
                  </button>

                  {/* Shadowing Mode Toggle */}
                  <Button
                    onClick={handleShadowingToggle}
                    variant={isShadowingMode ? 'default' : 'outline'}
                    size="sm"
                    className={`ml-2 gap-2 ${
                      isShadowingMode
                        ? 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700'
                        : 'border-violet-200 text-violet-700 hover:bg-violet-50'
                    }`}
                  >
                    <Headphones className="w-4 h-4" />
                    {isShadowingMode ? 'Exit Shadowing' : 'Shadowing'}
                  </Button>
                </div>

                <AnimatePresence>
                  {showTranscript && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 p-4 bg-gray-50 rounded-xl border border-gray-200">
                        {!isShadowingMode ? (
                          <TranscriptWithHighlights
                            transcript={analysis.transcript}
                            usefulSentences={analysis.useful_sentences}
                          />
                        ) : (
                          <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-6 text-center">
                            <Headphones className="mx-auto mb-3 h-10 w-10 text-violet-500" />
                            <p className="text-sm font-medium text-violet-900">Practice window is open</p>
                            <p className="mt-2 text-sm text-violet-800/90">
                              Video and sentences are in the overlay. Scroll the rest of the page freely, or close the window when you are done.
                            </p>
                          </div>
                        )}
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

    {/* Shadowing: dedicated window — video + transcript scroll together */}
    <Dialog open={isShadowingMode && !!analysis} onOpenChange={(open) => !open && exitShadowing()}>
      <DialogContent className="flex h-[min(92vh,880px)] w-[min(96vw,1200px)] max-w-[min(96vw,1200px)] translate-x-[-50%] translate-y-[-50%] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1200px)] [&>button]:top-3">
        {analysis && (
          <>
            <DialogHeader className="shrink-0 space-y-1 border-b bg-background px-4 py-3 pr-12 text-left">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Headphones className="h-4 w-4 text-violet-600" />
                Shadowing practice
              </DialogTitle>
              <DialogDescription className="line-clamp-1 text-left">
                {analysis.video_title}
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              {/* Video column — stays visible while transcript scrolls */}
              {extractVideoId(analysis.video_url) ? (
                <div className="shrink-0 border-b bg-red-50/40 p-4 lg:w-[min(42%,440px)] lg:border-b-0 lg:border-r">
                  <div className="mb-2 flex flex-col gap-1 text-sm font-medium text-red-900">
                    <div className="flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      Listen along
                    </div>
                    {analysis.transcript_segments.length > 0 && (
                      <p className="text-xs font-normal text-red-800/90">
                        Video follows the sentence you click or the row you are recording.
                      </p>
                    )}
                  </div>
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-inner">
                    <iframe
                      key={shadowingVideoEmbedSrc}
                      src={shadowingVideoEmbedSrc}
                      title={analysis.video_title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="absolute inset-0 h-full w-full"
                    />
                  </div>
                </div>
              ) : null}

              {/* Transcript & recording — only this side scrolls */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/20">
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="space-y-4">
                    {shadowingStats && shadowingStats.total_attempts > 0 && (
                      <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-sm font-semibold text-violet-900">Your Progress</span>
                          <Badge variant="outline" className="border-violet-300 bg-violet-100 text-violet-700">
                            {shadowingStats.total_attempts} attempts
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div>
                            <div className="text-lg font-bold text-violet-700">{shadowingStats.sentences_practiced}</div>
                            <div className="text-xs text-violet-600">Sentences</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-violet-700">
                              {shadowingStats.average_similarity_score?.toFixed(0) ?? '-'}
                            </div>
                            <div className="text-xs text-violet-600">Avg Score</div>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-violet-700">
                              {shadowingStats.best_similarity_score ?? '-'}
                            </div>
                            <div className="text-xs text-violet-600">Best Score</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                      <p className="text-sm text-violet-800">
                        <span className="font-semibold">Shadowing:</span> Click a sentence to hear that part in the video. Record <span className="font-medium">any</span> line in any order — mic starts/stops on the row you press. After a line is scored, use the <span className="font-medium">%</span> chip to open AI feedback.
                      </p>
                    </div>

                    {recorderError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                        <p className="text-sm text-red-600">{recorderError}</p>
                      </div>
                    )}

                    {shadowingError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                        <p className="text-sm text-red-600">{shadowingError}</p>
                      </div>
                    )}

                    <div className="space-y-3">
                      {shadowingPlan.map((line, index) => {
                        const sentence = line.text;
                        const hasRecording = sentenceRecordings.get(index);
                        const hasAttempt = shadowingAttempts.get(index);
                        const isCurrentSentence = currentSentenceIndex === index;
                        const isRecordingThis = isRecording && isCurrentSentence;
                        const scoreFromAttempt = hasAttempt?.evaluation.similarity_score ?? null;
                        const scoreFromStats = getBestScoreFromStats(index);
                        const bestScore = scoreFromAttempt ?? scoreFromStats;
                        const isCompleted = bestScore !== null;

                        return (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            className={`rounded-xl border p-4 transition-all ${
                              isRecordingThis
                                ? 'border-red-300 bg-red-50/60 shadow-md ring-1 ring-red-200'
                                : isCurrentSentence && !isCompleted
                                  ? 'border-violet-300 bg-violet-100 shadow-md ring-2 ring-violet-300/50'
                                  : isCurrentSentence && isCompleted
                                    ? 'border-emerald-200 bg-emerald-50 ring-2 ring-violet-400/45'
                                    : isCompleted
                                      ? 'border-emerald-200 bg-emerald-50'
                                      : hasRecording
                                        ? 'border-yellow-200 bg-yellow-50'
                                        : 'border-gray-200 bg-white'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                                  isCompleted
                                    ? 'bg-emerald-200 text-emerald-700'
                                    : hasRecording
                                      ? 'bg-yellow-200 text-yellow-700'
                                      : 'bg-gray-200 text-gray-600'
                                }`}
                              >
                                {index + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p
                                  role={!isRecordingThis && !isRecording ? 'button' : undefined}
                                  tabIndex={!isRecordingThis && !isRecording ? 0 : undefined}
                                  onClick={
                                    !isRecordingThis && !isRecording && submittingSentenceIndex !== index
                                      ? () => focusShadowingSentence(index)
                                      : undefined
                                  }
                                  onKeyDown={
                                    !isRecordingThis && !isRecording && submittingSentenceIndex !== index
                                      ? (e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            focusShadowingSentence(index);
                                          }
                                        }
                                      : undefined
                                  }
                                  className={`mb-2 text-sm ${
                                    isCurrentSentence && !isCompleted ? 'font-medium text-violet-900' : 'text-gray-700'
                                  } ${
                                    !isRecordingThis && !isRecording && submittingSentenceIndex !== index
                                      ? 'cursor-pointer rounded-md px-1 -mx-1 py-0.5 transition-colors hover:bg-violet-100/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400'
                                      : ''
                                  }`}
                                >
                                  {sentence}
                                </p>
                                {line.startTime != null &&
                                  line.endTime != null &&
                                  Number.isFinite(line.startTime) &&
                                  Number.isFinite(line.endTime) && (
                                    <p className="mb-2 flex items-center gap-1.5 text-xs tabular-nums text-gray-500">
                                      <Clock className="h-3 w-3 shrink-0" aria-hidden />
                                      <span>
                                        In video: {line.startTime.toFixed(1)}s – {line.endTime.toFixed(1)}s
                                      </span>
                                    </p>
                                  )}
                                <div className="flex flex-wrap items-center gap-2">
                                  {isRecordingThis ? (
                                    <motion.button
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleSentenceRecord(index);
                                      }}
                                      className="flex items-center gap-2 rounded-full bg-red-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-red-500/30"
                                    >
                                      <Square className="h-3 w-3 fill-current" />
                                      Stop & analyze {formatDuration(recordingDuration)}
                                    </motion.button>
                                  ) : submittingSentenceIndex === index ? (
                                    <span className="flex items-center gap-2 rounded-full bg-yellow-100 px-3 py-1.5 text-xs font-medium text-yellow-700">
                                      <motion.span
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                        className="inline-block h-3 w-3 rounded-full border-2 border-yellow-400 border-t-yellow-700"
                                      />
                                      Evaluating…
                                    </span>
                                  ) : isCompleted ? (
                                    <motion.button
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleSentenceRecord(index);
                                      }}
                                      className="flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-all hover:bg-emerald-200"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                      Re-record
                                    </motion.button>
                                  ) : isRecording && !isRecordingThis ? (
                                    <span
                                      className="flex cursor-not-allowed items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-400"
                                      title="Stop recording on the other sentence first"
                                    >
                                      <Mic className="h-3 w-3" />
                                      Recording elsewhere…
                                    </span>
                                  ) : (
                                    <motion.button
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleSentenceRecord(index);
                                      }}
                                      className="flex items-center gap-2 rounded-full bg-violet-500 px-3 py-1.5 text-xs font-medium text-white shadow-md hover:bg-violet-600"
                                    >
                                      <Mic className="h-3 w-3" />
                                      Record
                                    </motion.button>
                                  )}
                                  {bestScore !== null && (
                                    <motion.button
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleViewShadowingDetail(index);
                                      }}
                                      className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
                                        bestScore >= 80
                                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                                          : bestScore >= 60
                                            ? 'bg-yellow-500 text-white shadow-md shadow-yellow-500/30'
                                            : 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                                      }`}
                                    >
                                      <Sparkles className="h-3 w-3" />
                                      {bestScore}%
                                    </motion.button>
                                  )}
                                  {isCompleted && isCurrentSentence && !isRecordingThis && (
                                    <span className="flex animate-pulse items-center gap-1 text-xs font-medium text-emerald-600">
                                      <ChevronRight className="h-3 w-3" />
                                      Continue below ↓
                                    </span>
                                  )}
                                  {hasRecording && !hasAttempt && submittingSentenceIndex !== index && (
                                    <div className="flex items-center gap-2">
                                      <audio controls src={hasRecording.audioUrl} className="h-8 w-32" />
                                      <span className="text-xs text-gray-500">{formatDuration(hasRecording.duration)}</span>
                                    </div>
                                  )}
                                </div>
                                {isCompleted && !isRecordingThis && (
                                  <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 p-2">
                                    <div className="flex items-center gap-2 text-xs">
                                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                      <span className="text-emerald-700">
                                        {bestScore! >= 80
                                          ? 'Excellent! Move to the next sentence ↓'
                                          : bestScore! >= 60
                                            ? 'Good job! Continue to next or re-record to improve.'
                                            : 'Keep practicing! Move to next or try again.'}
                                      </span>
                                    </div>
                                  </div>
                                )}
                                {isRecordingThis && (
                                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2">
                                    <p className="text-xs font-medium text-red-800">
                                      When you are done speaking, press <span className="font-semibold">Stop & analyze</span>{' '}
                                      above to submit and get your score.
                                    </p>
                                  </div>
                                )}

                                <AnimatePresence>
                                  {evaluationExpandedIndex === index && hasAttempt && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      className="mt-3 overflow-hidden rounded-xl border-2 border-violet-200 bg-white"
                                    >
                                      <div className="flex items-center justify-between border-b border-violet-100 bg-violet-50/50 px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          <Sparkles className="h-4 w-4 text-violet-600" />
                                          <span className="text-sm font-semibold text-violet-900">AI Evaluation</span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setEvaluationExpandedIndex(null)}
                                          className="text-xs text-gray-500 hover:text-gray-700"
                                        >
                                          Close
                                        </button>
                                      </div>
                                      <div className="space-y-3 p-3">
                                        <div className="flex items-center gap-3">
                                          <div
                                            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                                              hasAttempt.evaluation.similarity_score >= 80
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : hasAttempt.evaluation.similarity_score >= 60
                                                  ? 'bg-yellow-100 text-yellow-700'
                                                  : 'bg-red-100 text-red-700'
                                            }`}
                                          >
                                            {hasAttempt.evaluation.similarity_score}%
                                          </div>
                                          <div>
                                            <div className="font-medium text-gray-900">Similarity Score</div>
                                            <div className="text-sm text-gray-500">
                                              {hasAttempt.evaluation.similarity_score >= 80
                                                ? 'Excellent match!'
                                                : hasAttempt.evaluation.similarity_score >= 60
                                                  ? 'Good attempt, keep practicing!'
                                                  : 'Needs more practice'}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="space-y-2">
                                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-2">
                                            <div className="mb-1 text-xs font-medium text-blue-600">Target:</div>
                                            <p className="text-sm text-gray-800">{hasAttempt.target_sentence}</p>
                                          </div>
                                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                                            <div className="mb-1 text-xs font-medium text-gray-500">You said:</div>
                                            <p className="text-sm text-gray-800">{hasAttempt.user_transcript}</p>
                                          </div>
                                        </div>
                                        {hasAttempt.evaluation.differences.length > 0 && (
                                          <div>
                                            <div className="mb-1 text-sm font-medium text-gray-700">Differences:</div>
                                            <div className="space-y-1">
                                              {hasAttempt.evaluation.differences.map((diff, i) => (
                                                <div key={i} className="flex items-center gap-2 text-sm">
                                                  <span className="text-red-600 line-through">{diff.expected}</span>
                                                  <span className="text-gray-400">→</span>
                                                  <span className="text-green-600">{diff.actual}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                                          <div className="mb-1 text-xs font-medium text-amber-700">Feedback:</div>
                                          <p className="text-sm text-amber-800">{hasAttempt.evaluation.feedback}</p>
                                        </div>
                                        {hasAttempt.audio_url && (
                                          <audio controls src={hasAttempt.audio_url} className="w-full" />
                                        )}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>

                    <div className="mt-2 rounded-lg bg-gray-100 p-3">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-gray-600">Progress</span>
                        <span className="font-medium text-gray-800">
                          {shadowingProgressCounts.evaluated} / {shadowingProgressCounts.total} evaluated
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <motion.div
                          className="h-full bg-gradient-to-r from-violet-500 to-purple-600"
                          initial={{ width: 0 }}
                          animate={{
                            width: `${
                              shadowingProgressCounts.total > 0
                                ? (shadowingProgressCounts.evaluated / shadowingProgressCounts.total) * 100
                                : 0
                            }%`,
                          }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
