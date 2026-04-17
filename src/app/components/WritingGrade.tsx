import { useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { motion } from 'motion/react';
import { FileText, TrendingUp, Award, Target, Sparkles } from 'lucide-react';
import { API_ROUTES, apiFetch, unwrapApiPayload } from '../../config/api';

interface GradeAnalysis {
  score: number;
  grade: string;
  strengths: string[];
  weaknesses: string[];
  vocabulary: number;
  grammar: number;
  clarity: number;
  style: number;
}

function parseGradeAnalysis(data: Record<string, unknown>): GradeAnalysis {
  return {
    score: Number(data.score ?? 0),
    grade: String(data.grade ?? ''),
    strengths: Array.isArray(data.strengths) ? data.strengths.map(String) : [],
    weaknesses: Array.isArray(data.weaknesses) ? data.weaknesses.map(String) : [],
    vocabulary: Number(data.vocabulary ?? data.vocabulary_score ?? 0),
    grammar: Number(data.grammar ?? data.grammar_score ?? 0),
    clarity: Number(data.clarity ?? data.clarity_score ?? 0),
    style: Number(data.style ?? data.style_score ?? 0),
  };
}

export function WritingGrade() {
  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState<GradeAnalysis | null>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gradeWriting = async () => {
    if (!text.trim()) return;

    setIsGrading(true);
    setError(null);

    try {
      const res = await apiFetch(API_ROUTES.gradeWriting, {
        method: 'POST',
        body: JSON.stringify({ text: text.trim() }),
      });
      const bodyText = await res.text();
      let json: unknown;
      try {
        json = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        throw new Error(bodyText || 'Invalid JSON from server');
      }
      if (!res.ok) {
        const msg =
          json && typeof json === 'object' && 'message' in json
            ? String((json as { message: unknown }).message)
            : bodyText || res.statusText;
        throw new Error(msg);
      }
      const payload = unwrapApiPayload(json) ?? (json as Record<string, unknown> | null);
      if (!payload) throw new Error('Empty response from server');
      setAnalysis(parseGradeAnalysis(payload));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setIsGrading(false);
    }
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith('A')) return 'from-green-400 to-emerald-500';
    if (grade.startsWith('B')) return 'from-blue-400 to-cyan-500';
    if (grade.startsWith('C')) return 'from-yellow-400 to-orange-500';
    return 'from-red-400 to-pink-500';
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 75) return 'text-blue-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Side - Input */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-lg p-6 h-fit"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-gradient-to-br from-pink-400 to-orange-400 rounded-lg flex items-center justify-center">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <h2>Submit Your Writing</h2>
        </div>
        
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your essay, paragraph, or any text you'd like to evaluate..."
          className="min-h-[300px] rounded-xl border-2 border-gray-200 focus:border-pink-400 resize-none mb-4"
        />
        
        {error && (
          <p className="text-sm text-red-600 mb-3" role="alert">
            {error}
          </p>
        )}

        <Button
          onClick={gradeWriting}
          disabled={!text.trim() || isGrading}
          className="w-full bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white rounded-xl py-6 shadow-md hover:shadow-lg transition-all"
        >
          {isGrading ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="mr-2"
              >
                <Sparkles className="w-4 h-4" />
              </motion.div>
              Grading...
            </>
          ) : (
            <>
              <Award className="w-4 h-4 mr-2" />
              Grade My Writing
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground mt-3 text-center">
          Your writing will be evaluated for vocabulary, grammar, clarity, and style
        </p>
      </motion.div>

      {/* Right Side - Results */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl shadow-lg p-6"
      >
        {analysis ? (
          <div className="space-y-6">
            {/* Overall Grade */}
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className={`inline-flex items-center justify-center w-32 h-32 rounded-3xl bg-gradient-to-br ${getGradeColor(analysis.grade)} shadow-lg mb-4`}
              >
                <div className="text-center">
                  <div className="text-5xl text-white mb-1">{analysis.grade}</div>
                  <div className="text-sm text-white/90">{analysis.score}/100</div>
                </div>
              </motion.div>
              <h3>Overall Grade</h3>
              <p className="text-muted-foreground">Great work! Keep improving</p>
            </div>

            {/* Detailed Scores */}
            <div>
              <h4 className="mb-4 flex items-center gap-2">
                <Target className="w-4 h-4 text-pink-600" />
                Detailed Breakdown
              </h4>
              <div className="space-y-4">
                {[
                  { name: 'Vocabulary', score: analysis.vocabulary, icon: '📚' },
                  { name: 'Grammar', score: analysis.grammar, icon: '✍️' },
                  { name: 'Clarity', score: analysis.clarity, icon: '💡' },
                  { name: 'Style', score: analysis.style, icon: '🎨' }
                ].map((item, index) => (
                  <motion.div
                    key={item.name}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm flex items-center gap-2">
                        <span>{item.icon}</span>
                        {item.name}
                      </span>
                      <span className={`${getScoreColor(item.score)}`}>
                        {item.score}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${item.score}%` }}
                        transition={{ duration: 1, delay: index * 0.1 }}
                        className="h-full bg-gradient-to-r from-pink-400 to-orange-400 rounded-full"
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Strengths */}
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-green-600">
                <TrendingUp className="w-4 h-4" />
                Strengths
              </h4>
              <div className="space-y-2">
                {analysis.strengths.map((strength, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start gap-3 p-3 bg-green-50 rounded-xl"
                  >
                    <div className="w-6 h-6 bg-green-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-green-700">✓</span>
                    </div>
                    <p className="text-sm text-gray-700">{strength}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Weaknesses */}
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-orange-600">
                <Target className="w-4 h-4" />
                Areas for Improvement
              </h4>
              <div className="space-y-2">
                {analysis.weaknesses.map((weakness, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start gap-3 p-3 bg-orange-50 rounded-xl"
                  >
                    <div className="w-6 h-6 bg-orange-200 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs text-orange-700">{index + 1}</span>
                    </div>
                    <p className="text-sm text-gray-700">{weakness}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <Award className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-gray-400 mb-2">No Grade Yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Submit your writing to receive a comprehensive grade and feedback
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
