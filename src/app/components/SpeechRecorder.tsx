import { useState, useCallback, useEffect } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  Square,
  Clock,
  Sparkles,
  TrendingUp,
  Lightbulb,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Play,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Mic2,
  Volume2,
} from 'lucide-react';
import {
  API_ROUTES,
  apiFetch,
  speechDetailPath,
  unwrapApiPayload,
} from '../../config/api';
import { useAudioRecorder } from '../hooks/useAudioRecorder';

// Types
interface Strength {
  point: string;
  example: string;
}

interface Improvement {
  point: string;
  example: string;
  tip: string;
}

interface SpeechEvaluation {
  overall_score: number;
  pronunciation_score: number;
  fluency_score: number;
  grammar_score: number;
  vocabulary_score: number;
  strengths: Strength[];
  improvements: Improvement[];
  detailed_feedback: string;
  learning_tip: string;
}

interface SpeechEvaluationResponse {
  id: string;
  created_at: string;
  audio_url: string;
  audio_duration_seconds: number | null;
  transcript: string;
  youtube_gem_id: string | null;
  evaluation: SpeechEvaluation;
}

interface SpeechHistoryItem {
  id: string;
  created_at: string;
  audio_url: string;
  audio_duration_seconds: number | null;
  overall_score: number | null;
  transcript_preview: string;
}

interface SpeechHistoryResponse {
  items: SpeechHistoryItem[];
  total: number;
  page: number;
  page_size: number;
}

const HISTORY_PAGE_SIZE = 20;

// Score Card Component
function ScoreCard({
  label,
  score,
  colorClass,
}: {
  label: string;
  score: number;
  colorClass: string;
}) {
  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 text-center border border-gray-100">
      <div
        className={`text-3xl font-bold bg-gradient-to-br ${colorClass} bg-clip-text text-transparent`}
      >
        {score}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

// Score Badge Component
function ScoreBadge({ score }: { score: number }) {
  let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'default';
  let label = '';
  let className = '';

  if (score >= 85) {
    label = 'Excellent';
    className = 'bg-emerald-100 text-emerald-700 border-emerald-200';
  } else if (score >= 70) {
    label = 'Good';
    className = 'bg-blue-100 text-blue-700 border-blue-200';
  } else if (score >= 55) {
    label = 'Fair';
    className = 'bg-yellow-100 text-yellow-700 border-yellow-200';
  } else {
    label = 'Needs Work';
    className = 'bg-red-100 text-red-700 border-red-200';
  }

  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

// Format duration helper
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Main Component
export function SpeechRecorder() {
  const {
    isRecording,
    duration,
    startRecording,
    stopRecording,
    reset: resetRecorder,
    error: recorderError,
  } = useAudioRecorder();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [result, setResult] = useState<SpeechEvaluationResponse | null>(null);

  // History state
  const [history, setHistory] = useState<SpeechHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [selectedRecordingId, setSelectedRecordingId] = useState<
    string | null
  >(null);
  const [detail, setDetail] = useState<SpeechEvaluationResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Computed current data (result takes precedence over detail)
  const currentData = result || detail;
  const evaluation = currentData?.evaluation;

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await apiFetch(
        `${API_ROUTES.speechHistory}?page=${historyPage}&page_size=${HISTORY_PAGE_SIZE}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch speech history');
      }
      const data = (await response.json()) as SpeechHistoryResponse;
      setHistory(data.items);
      setHistoryTotal(data.total);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage]);

  const handleToggleRecording = async () => {
    if (isRecording) {
      // Stop recording
      const audioFile = await stopRecording();

      if (audioFile) {
        setIsUploading(true);
        setUploadError(null);

        try {
          const formData = new FormData();
          formData.append('audio', audioFile);
          formData.append('duration_seconds', duration.toString());

          const response = await apiFetch(API_ROUTES.speechEvaluate, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(
              (error as { detail?: string }).detail || 'Failed to evaluate speech'
            );
          }

          const data = await response.json();
          const unwrapped = unwrapApiPayload(data);
          const evaluation = (unwrapped || data) as SpeechEvaluationResponse;
          console.log('Speech evaluation response:', evaluation);
          console.log('Audio URL:', evaluation.audio_url);
          setResult(evaluation);

          // Refresh history
          void loadHistory();
        } catch (err) {
          setUploadError(
            err instanceof Error ? err.message : 'Evaluation failed'
          );
        } finally {
          setIsUploading(false);
        }
      }
    } else {
      // Start recording
      setResult(null);
      setUploadError(null);
      resetRecorder();
      await startRecording();
    }
  };

  const handleSelectRecording = async (id: string) => {
    setSelectedRecordingId(id);
    setDetailLoading(true);
    try {
      const response = await apiFetch(speechDetailPath(id));
      if (!response.ok) {
        throw new Error('Failed to fetch recording details');
      }
      const data = await response.json();
      const unwrapped = unwrapApiPayload(data);
      const detailData = (unwrapped || data) as SpeechEvaluationResponse;
      console.log('Speech detail loaded:', detailData);
      console.log('Detail Audio URL:', detailData.audio_url);
      setDetail(detailData);
    } catch (err) {
      console.error('Failed to load detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setUploadError(null);
    setSelectedRecordingId(null);
    setDetail(null);
    resetRecorder();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column - Recording & Current Result */}
      <div className="lg:col-span-2 space-y-6">
        {/* Recording Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-gray-100"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-100 to-purple-100 mb-4">
              <Mic2 className="w-10 h-10 text-violet-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              Speech Practice
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Record yourself speaking and get AI-powered feedback on your
              pronunciation, fluency, grammar, and vocabulary.
            </p>
          </div>

          {/* Recording Controls */}
          <div className="flex flex-col items-center gap-6">
            {/* Record Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleToggleRecording}
              disabled={isUploading}
              className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
                isRecording
                  ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30 shadow-2xl'
                  : isUploading
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-violet-500/30 shadow-2xl'
              }`}
            >
              {isUploading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full"
                />
              ) : isRecording ? (
                <Square className="w-12 h-12 text-white fill-white" />
              ) : (
                <Mic className="w-12 h-12 text-white" />
              )}

              {/* Recording Pulse Animation */}
              {isRecording && (
                <>
                  <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20" />
                  <span className="absolute -inset-4 rounded-full bg-red-500/10 animate-pulse" />
                </>
              )}
            </motion.button>

            {/* Status Text */}
            <div className="text-center">
              {isUploading ? (
                <p className="text-gray-600 font-medium">
                  Analyzing your speech...
                </p>
              ) : isRecording ? (
                <p className="text-red-500 font-medium animate-pulse">
                  Recording... Tap to stop
                </p>
              ) : (
                <p className="text-gray-600 font-medium">
                  Tap to start recording
                </p>
              )}
            </div>

            {/* Duration Display */}
            {isRecording && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 rounded-full border border-red-100"
              >
                <Clock className="w-4 h-4 text-red-500" />
                <span className="text-red-600 font-mono font-semibold">
                  {formatDuration(duration)}
                </span>
                <span className="text-red-400 text-xs">/ 10:00</span>
              </motion.div>
            )}
          </div>

          {/* Error Display */}
          <AnimatePresence>
            {(recorderError || uploadError) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <p className="text-red-600 text-sm">
                  {recorderError || uploadError}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Evaluation Results */}
        <AnimatePresence mode="wait">
          {(result || detail) && (
            <motion.div
              key={result ? 'new' : 'detail'}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-gray-100"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">
                      AI Evaluation
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {result
                        ? 'Just now'
                        : detail &&
                          new Date(detail.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ScoreBadge
                    score={
                      evaluation?.overall_score || 0
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    New
                  </Button>
                </div>
              </div>

              {/* Scores Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
                <ScoreCard
                  label="Overall"
                  score={evaluation?.overall_score || 0}
                  colorClass="from-emerald-500 to-teal-600"
                />
                <ScoreCard
                  label="Pronunciation"
                  score={evaluation?.pronunciation_score || 0}
                  colorClass="from-blue-500 to-indigo-600"
                />
                <ScoreCard
                  label="Fluency"
                  score={evaluation?.fluency_score || 0}
                  colorClass="from-violet-500 to-purple-600"
                />
                <ScoreCard
                  label="Grammar"
                  score={evaluation?.grammar_score || 0}
                  colorClass="from-pink-500 to-rose-600"
                />
                <ScoreCard
                  label="Vocabulary"
                  score={evaluation?.vocabulary_score || 0}
                  colorClass="from-orange-500 to-amber-600"
                />
              </div>

              {/* Transcript */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-5 h-5 text-gray-500" />
                  <h4 className="font-semibold text-gray-800">Transcript</h4>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-gray-700 leading-relaxed">
                    {(result || detail)?.transcript}
                  </p>
                </div>
              </div>

              {/* Audio Playback */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <Volume2 className="w-5 h-5 text-gray-500" />
                  <h4 className="font-semibold text-gray-800">
                    Your Recording
                  </h4>
                </div>
                {(result || detail)?.audio_url ? (
                <div className="space-y-2">
                  <audio
                    controls
                    src={(result || detail)?.audio_url}
                    className="w-full"
                    preload="metadata"
                    crossOrigin="anonymous"
                    onError={(e) => {
                      console.error('Audio playback error:', e);
                      const audioEl = e.currentTarget;
                      console.log('Audio src:', audioEl.src);
                      console.log('Audio error code:', audioEl.error?.code);
                      console.log('Audio error message:', audioEl.error?.message);
                    }}
                  />
                  <a
                    href={(result || detail)?.audio_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1"
                  >
                    Open audio in new tab (if player doesn&apos;t work)
                  </a>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-center">
                  <p className="text-sm text-gray-500">
                    Audio not available - URL missing
                  </p>
                </div>
              )}
              </div>

              {/* Strengths */}
              {evaluation?.strengths && evaluation.strengths.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <h4 className="font-semibold text-gray-800">Strengths</h4>
                  </div>
                  <div className="space-y-3">
                    {evaluation.strengths.map((s, i) => (
                      <div
                        key={i}
                        className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4"
                      >
                        <p className="font-medium text-emerald-800 mb-1">
                          {s.point}
                        </p>
                        <p className="text-sm text-emerald-600 italic">
                          &ldquo;{s.example}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Improvements */}
              {evaluation?.improvements && evaluation.improvements.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-5 h-5 text-blue-500" />
                    <h4 className="font-semibold text-gray-800">
                      Areas to Improve
                    </h4>
                  </div>
                  <div className="space-y-3">
                    {evaluation.improvements.map(
                      (imp, i) => (
                        <div
                          key={i}
                          className="bg-blue-50/50 border border-blue-100 rounded-xl p-4"
                        >
                          <p className="font-medium text-blue-800 mb-1">
                            {imp.point}
                          </p>
                          <p className="text-sm text-blue-600 italic mb-2">
                            &ldquo;{imp.example}&rdquo;
                          </p>
                          <p className="text-sm text-blue-700 bg-blue-100/50 rounded-lg px-3 py-2">
                            💡 {imp.tip}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Detailed Feedback */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-5 h-5 text-gray-500" />
                  <h4 className="font-semibold text-gray-800">
                    Detailed Feedback
                  </h4>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-gray-700 leading-relaxed">
                    {evaluation?.detailed_feedback}
                  </p>
                </div>
              </div>

              {/* Learning Tip */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-5 h-5 text-amber-500" />
                  <h4 className="font-semibold text-gray-800">Learning Tip</h4>
                </div>
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-100">
                  <p className="text-amber-800">
                    {evaluation?.learning_tip}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right Column - History */}
      <div className="space-y-6">
        {/* History Toggle (Mobile) */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setShowHistory(!showHistory)}
          className="lg:hidden w-full bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-gray-100 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <Play className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Recording History</h3>
              <p className="text-sm text-muted-foreground">
                {historyTotal} recordings
              </p>
            </div>
          </div>
          {showHistory ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </motion.button>

        {/* History Panel */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className={`bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-100 overflow-hidden ${
            showHistory ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                <Play className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">
                  Recording History
                </h3>
                <p className="text-sm text-muted-foreground">
                  {historyTotal} recordings
                </p>
              </div>
            </div>
          </div>

          <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
            {historyLoading ? (
              <div className="p-8 text-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="w-8 h-8 border-4 border-gray-200 border-t-violet-500 rounded-full mx-auto mb-3"
                />
                <p className="text-muted-foreground text-sm">Loading...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <Mic className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-muted-foreground text-sm">
                  No recordings yet.
                  <br />
                  Start practicing!
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {history.map((item) => (
                  <motion.button
                    key={item.id}
                    whileHover={{ backgroundColor: 'rgba(139, 92, 246, 0.05)' }}
                    onClick={() => handleSelectRecording(item.id)}
                    className={`w-full p-4 text-left transition-colors ${
                      selectedRecordingId === item.id
                        ? 'bg-violet-50/50'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm text-gray-500">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                      {item.overall_score !== null && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            item.overall_score >= 70
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                              : item.overall_score >= 55
                                ? 'bg-yellow-50 text-yellow-600 border-yellow-200'
                                : 'bg-red-50 text-red-600 border-red-200'
                          }`}
                        >
                          {item.overall_score}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2 mb-1">
                      {item.transcript_preview}
                    </p>
                    {item.audio_duration_seconds && (
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        {formatDuration(item.audio_duration_seconds)}
                      </div>
                    )}
                  </motion.button>
                ))}
              </div>
            )}

            {/* Pagination */}
            {historyTotal > HISTORY_PAGE_SIZE && (
              <div className="p-4 border-t border-gray-100 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={historyPage === 0}
                  onClick={() => {
                    setHistoryPage((p) => p - 1);
                    void loadHistory();
                  }}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {historyPage + 1} of{' '}
                  {Math.ceil(historyTotal / HISTORY_PAGE_SIZE)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={(historyPage + 1) * HISTORY_PAGE_SIZE >= historyTotal}
                  onClick={() => {
                    setHistoryPage((p) => p + 1);
                    void loadHistory();
                  }}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
