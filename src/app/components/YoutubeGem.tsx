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
  const [isSubmittingShadowing, setIsSubmittingShadowing] = useState(false);
  const [selectedShadowingAttempt, setSelectedShadowingAttempt] = useState<ShadowingAttemptResponse | null>(null);

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

  // Extract YouTube video ID from URL
  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
      /youtube\.com\/shorts\/([^&\s?]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  };

  // Split transcript into sentences for shadowing
  const getSentences = (transcript: string): string[] => {
    // Split by sentence endings (. ! ?) followed by space or end of string
    // Keep the punctuation
    const sentences = transcript
      .replace(/([.!?])(\s+)(?=[A-Z])/g, '$1\n')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return sentences;
  };

  const handleShadowingToggle = () => {
    const newMode = !isShadowingMode;
    setIsShadowingMode(newMode);
    setCurrentSentenceIndex(0);
    setShadowingError(null);
    setSelectedShadowingAttempt(null);

    if (!newMode) {
      // Reset all shadowing state when exiting shadowing mode
      setSentenceRecordings(new Map());
      setShadowingAttempts(new Map());
      setShadowingStats(null);
    } else if (analysis) {
      // Load stats when entering shadowing mode
      void loadShadowingStats();
    }
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

        // Submit to backend for evaluation
        setIsSubmittingShadowing(true);
        setShadowingError(null);

        try {
          const sentences = getSentences(analysis.transcript);
          const targetSentence = sentences[sentenceIndex];

          const attempt = await submitShadowingAttempt(
            audioFile,
            analysis.id,
            targetSentence,
            sentenceIndex,
            recordingDuration
          );

          // Store the attempt result
          setShadowingAttempts((prev) => {
            const newMap = new Map(prev);
            newMap.set(sentenceIndex, attempt);
            return newMap;
          });

          // Auto-show the result
          setSelectedShadowingAttempt(attempt);

          // Refresh stats
          void loadShadowingStats();
        } catch (err) {
          setShadowingError(err instanceof Error ? err.message : 'Failed to evaluate shadowing attempt');
        } finally {
          setIsSubmittingShadowing(false);
        }

        // Move to next sentence if available
        const sentences = analysis ? getSentences(analysis.transcript) : [];
        if (sentenceIndex < sentences.length - 1) {
          setCurrentSentenceIndex(sentenceIndex + 1);
        }
      }
    } else {
      // Start recording
      setShadowingError(null);
      await startRecording();
    }
  };

  // Load shadowing stats for current video
  const loadShadowingStats = useCallback(async () => {
    if (!analysis) return;
    try {
      const stats = await getShadowingStats(analysis.id);
      setShadowingStats(stats);
    } catch {
      // Silently fail - stats are not critical
    }
  }, [analysis]);

  // Load stats when entering shadowing mode or when analysis changes
  useEffect(() => {
    if (isShadowingMode && analysis) {
      void loadShadowingStats();
    }
  }, [isShadowingMode, analysis, loadShadowingStats]);

  // Auto-set current sentence to the next unrecorded one when stats load
  useEffect(() => {
    if (isShadowingMode && shadowingStats && analysis) {
      const sentences = getSentences(analysis.transcript);
      const recordedIndices = new Set(
        shadowingStats.progress_by_sentence.map(p => p.sentence_index)
      );

      // Find first sentence that hasn't been recorded
      const nextIndex = sentences.findIndex((_, idx) => !recordedIndices.has(idx));

      if (nextIndex !== -1) {
        setCurrentSentenceIndex(nextIndex);
      } else if (sentences.length > 0) {
        // All recorded, go to last sentence
        setCurrentSentenceIndex(sentences.length - 1);
      }
    }
  }, [isShadowingMode, shadowingStats, analysis]);

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
    // Check if we have it locally first
    const localAttempt = shadowingAttempts.get(sentenceIndex);
    if (localAttempt) {
      setSelectedShadowingAttempt(localAttempt);
      return;
    }

    // Need to fetch from backend - construct composite ID
    if (!analysis || !selectedProfileId) return;

    // Composite ID format: {profile_id}:{youtube_gem_id}:{sentence_index}
    const compositeId = `${selectedProfileId}:${analysis.id}:${sentenceIndex}`;

    try {
      const attempt = await getShadowingDetail(compositeId);
      // Store it locally for future use
      setShadowingAttempts(prev => {
        const newMap = new Map(prev);
        newMap.set(sentenceIndex, attempt);
        return newMap;
      });
      setSelectedShadowingAttempt(attempt);
    } catch (err) {
      console.error('Failed to load shadowing detail:', err);
      setShadowingError('Failed to load evaluation details');
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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

            {/* YouTube Embed */}
            {extractVideoId(analysis.video_url) && (
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
                          // Normal transcript view
                          <TranscriptWithHighlights
                            transcript={analysis.transcript}
                            usefulSentences={analysis.useful_sentences}
                          />
                        ) : (
                          // Shadowing mode - sentence by sentence
                          <div className="space-y-4">
                            {/* Shadowing Stats Panel */}
                            {shadowingStats && shadowingStats.total_attempts > 0 && (
                              <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-200">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-sm font-semibold text-violet-900">Your Progress</span>
                                  <Badge variant="outline" className="bg-violet-100 text-violet-700 border-violet-300">
                                    {shadowingStats.total_attempts} attempts
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-3 gap-3 text-center">
                                  <div>
                                    <div className="text-lg font-bold text-violet-700">
                                      {shadowingStats.sentences_practiced}
                                    </div>
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

                            <div className="p-3 bg-violet-50 rounded-lg border border-violet-200">
                              <p className="text-sm text-violet-800">
                                <span className="font-semibold">Shadowing Mode:</span> Read each sentence aloud, then record yourself mimicking the pronunciation. Click the mic button to start/stop recording.
                              </p>
                            </div>

                            {recorderError && (
                              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                                <p className="text-sm text-red-600">{recorderError}</p>
                              </div>
                            )}

                            {shadowingError && (
                              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                                <p className="text-sm text-red-600">{shadowingError}</p>
                              </div>
                            )}

                            {/* Selected Attempt Detail View */}
                            <AnimatePresence>
                              {selectedShadowingAttempt && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="bg-white rounded-xl border-2 border-violet-200 overflow-hidden"
                                >
                                  <div className="p-4 border-b border-violet-100 bg-violet-50/50">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Sparkles className="w-4 h-4 text-violet-600" />
                                        <span className="font-semibold text-violet-900">AI Evaluation</span>
                                      </div>
                                      <button
                                        onClick={() => setSelectedShadowingAttempt(null)}
                                        className="text-xs text-gray-500 hover:text-gray-700"
                                      >
                                        Close
                                      </button>
                                    </div>
                                  </div>
                                  <div className="p-4 space-y-4">
                                    {/* Similarity Score */}
                                    <div className="flex items-center gap-4">
                                      <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold ${
                                        selectedShadowingAttempt.evaluation.similarity_score >= 80
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : selectedShadowingAttempt.evaluation.similarity_score >= 60
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : 'bg-red-100 text-red-700'
                                      }`}>
                                        {selectedShadowingAttempt.evaluation.similarity_score}%
                                      </div>
                                      <div>
                                        <div className="font-medium text-gray-900">Similarity Score</div>
                                        <div className="text-sm text-gray-500">
                                          {selectedShadowingAttempt.evaluation.similarity_score >= 80
                                            ? 'Excellent match!'
                                            : selectedShadowingAttempt.evaluation.similarity_score >= 60
                                              ? 'Good attempt, keep practicing!'
                                              : 'Needs more practice'}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Comparison */}
                                    <div className="space-y-2">
                                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                        <div className="text-xs text-blue-600 font-medium mb-1">Target:</div>
                                        <p className="text-sm text-gray-800">{selectedShadowingAttempt.target_sentence}</p>
                                      </div>
                                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                                        <div className="text-xs text-gray-500 font-medium mb-1">You said:</div>
                                        <p className="text-sm text-gray-800">{selectedShadowingAttempt.user_transcript}</p>
                                      </div>
                                    </div>

                                    {/* Differences */}
                                    {selectedShadowingAttempt.evaluation.differences.length > 0 && (
                                      <div>
                                        <div className="text-sm font-medium text-gray-700 mb-2">Differences:</div>
                                        <div className="space-y-1">
                                          {selectedShadowingAttempt.evaluation.differences.map((diff, i) => (
                                            <div key={i} className="flex items-center gap-2 text-sm">
                                              <span className="text-red-600 line-through">{diff.expected}</span>
                                              <span className="text-gray-400">→</span>
                                              <span className="text-green-600">{diff.actual}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Feedback */}
                                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                                      <div className="text-xs text-amber-700 font-medium mb-1">Feedback:</div>
                                      <p className="text-sm text-amber-800">{selectedShadowingAttempt.evaluation.feedback}</p>
                                    </div>

                                    {/* Audio Playback */}
                                    {selectedShadowingAttempt.audio_url && (
                                      <audio controls src={selectedShadowingAttempt.audio_url} className="w-full" />
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Submitting indicator */}
                            {isSubmittingShadowing && (
                              <div className="p-3 bg-violet-50 rounded-lg border border-violet-200 flex items-center gap-3">
                                <motion.div
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                  className="w-5 h-5 border-2 border-violet-300 border-t-violet-600 rounded-full"
                                />
                                <span className="text-sm text-violet-700">Evaluating your pronunciation...</span>
                              </div>
                            )}

                            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                              {getSentences(analysis.transcript).map((sentence, index) => {
                                const hasRecording = sentenceRecordings.get(index);
                                const hasAttempt = shadowingAttempts.get(index);
                                const isCurrentSentence = currentSentenceIndex === index;
                                const isRecordingThis = isRecording && isCurrentSentence;

                                // Get score from either local attempt or loaded stats
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
                                    className={`p-4 rounded-xl border transition-all ${
                                      isCurrentSentence && !isCompleted
                                        ? 'bg-violet-100 border-violet-300 shadow-md'
                                        : isCompleted
                                          ? 'bg-emerald-50 border-emerald-200'
                                          : hasRecording
                                            ? 'bg-yellow-50 border-yellow-200'
                                            : 'bg-white border-gray-200'
                                    }`}
                                  >
                                    <div className="flex items-start gap-3">
                                      <span className={`flex-shrink-0 w-7 h-7 rounded-full text-xs font-medium flex items-center justify-center ${
                                        isCompleted
                                          ? 'bg-emerald-200 text-emerald-700'
                                          : hasRecording
                                            ? 'bg-yellow-200 text-yellow-700'
                                            : 'bg-gray-200 text-gray-600'
                                      }`}>
                                        {index + 1}
                                      </span>

                                      <div className="flex-1 min-w-0">
                                        <p className={`text-sm mb-2 ${isCurrentSentence && !isCompleted ? 'text-violet-900 font-medium' : 'text-gray-700'}`}>
                                          {sentence}
                                        </p>

                                        <div className="flex items-center gap-2 flex-wrap">
                                          {/* Record Button - different states based on sentence status */}
                                          {isCompleted ? (
                                            // Already has score from stats - show re-record option
                                            <motion.button
                                              whileHover={{ scale: 1.05 }}
                                              whileTap={{ scale: 0.95 }}
                                              onClick={() => handleSentenceRecord(index)}
                                              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all"
                                            >
                                              <RotateCcw className="w-3 h-3" />
                                              Re-record
                                            </motion.button>
                                          ) : isRecordingThis ? (
                                            // Currently recording
                                            <motion.button
                                              whileHover={{ scale: 1.05 }}
                                              whileTap={{ scale: 0.95 }}
                                              onClick={() => handleSentenceRecord(index)}
                                              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-red-500 text-white shadow-red-500/30 shadow-lg"
                                            >
                                              <Square className="w-3 h-3 fill-current" />
                                              Recording {formatDuration(recordingDuration)}
                                            </motion.button>
                                          ) : hasRecording ? (
                                            // Processing
                                            <span className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                              <Mic className="w-3 h-3" />
                                              Processing...
                                            </span>
                                          ) : isCurrentSentence ? (
                                            // Ready to record
                                            <motion.button
                                              whileHover={{ scale: 1.05 }}
                                              whileTap={{ scale: 0.95 }}
                                              onClick={() => handleSentenceRecord(index)}
                                              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-violet-500 text-white hover:bg-violet-600 shadow-md"
                                            >
                                              <Mic className="w-3 h-3" />
                                              Record
                                            </motion.button>
                                          ) : (
                                            // Not yet available
                                            <span className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-400">
                                              <Mic className="w-3 h-3" />
                                              Record
                                            </span>
                                          )}

                                          {/* Score Badge - show from stats or local attempt */}
                                          {bestScore !== null && (
                                            <motion.button
                                              whileHover={{ scale: 1.05 }}
                                              whileTap={{ scale: 0.95 }}
                                              onClick={() => handleViewShadowingDetail(index)}
                                              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                                                bestScore >= 80
                                                  ? 'bg-emerald-500 text-white shadow-emerald-500/30 shadow-md'
                                                  : bestScore >= 60
                                                    ? 'bg-yellow-500 text-white shadow-yellow-500/30 shadow-md'
                                                    : 'bg-orange-500 text-white shadow-orange-500/30 shadow-md'
                                              }`}
                                            >
                                              <Sparkles className="w-3 h-3" />
                                              {bestScore}%
                                            </motion.button>
                                          )}

                                          {/* Next sentence indicator - show when current sentence is completed */}
                                          {isCompleted && isCurrentSentence && (
                                            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1 animate-pulse">
                                              <ChevronRight className="w-3 h-3" />
                                              Continue below ↓
                                            </span>
                                          )}

                                          {/* Recording Playback (local while processing) */}
                                          {hasRecording && !hasAttempt && (
                                            <div className="flex items-center gap-2">
                                              <audio
                                                controls
                                                src={hasRecording.audioUrl}
                                                className="h-8 w-32"
                                              />
                                              <span className="text-xs text-gray-500">
                                                {formatDuration(hasRecording.duration)}
                                              </span>
                                            </div>
                                          )}
                                        </div>

                                        {/* Success message with guidance for completed sentences */}
                                        {isCompleted && (
                                          <div className="mt-2 p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                                            <div className="flex items-center gap-2 text-xs">
                                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
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
                                      </div>
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>

                            {/* Shadowing Progress */}
                            <div className="mt-4 p-3 bg-gray-100 rounded-lg">
                              <div className="flex items-center justify-between text-sm mb-2">
                                <span className="text-gray-600">Progress</span>
                                <span className="font-medium text-gray-800">
                                  {shadowingAttempts.size} / {getSentences(analysis.transcript).length} evaluated
                                </span>
                              </div>
                              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                <motion.div
                                  className="h-full bg-gradient-to-r from-violet-500 to-purple-600"
                                  initial={{ width: 0 }}
                                  animate={{
                                    width: `${(shadowingAttempts.size / getSentences(analysis.transcript).length) * 100}%`,
                                  }}
                                  transition={{ duration: 0.3 }}
                                />
                              </div>
                            </div>
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
  );
}
