import { useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { motion, AnimatePresence } from 'motion/react';
import { Send, CheckCircle, AlertCircle, Sparkles, History } from 'lucide-react';

interface SentenceAnalysis {
  id: string;
  original: string;
  corrected: string;
  mistakes: string[];
  improvements: string[];
  timestamp: Date;
}

export function CorrectSentence() {
  const [sentence, setSentence] = useState('');
  const [history, setHistory] = useState<SentenceAnalysis[]>([
    {
      id: '1',
      original: "I goes to school yesterday and meet my friend.",
      corrected: "I went to school yesterday and met my friend.",
      mistakes: [
        "Verb tense error: 'goes' should be 'went' (past tense)",
        "Verb tense error: 'meet' should be 'met' (past tense)"
      ],
      improvements: [
        "Use past tense consistently when describing past events",
        "Ensure subject-verb agreement throughout the sentence"
      ],
      timestamp: new Date(Date.now() - 3600000)
    },
    {
      id: '2',
      original: "She don't like coffee very much.",
      corrected: "She doesn't like coffee very much.",
      mistakes: [
        "Subject-verb agreement: 'don't' should be 'doesn't' with third-person singular"
      ],
      improvements: [
        "Use 'doesn't' with he/she/it subjects",
        "Consider adding emphasis: 'She really doesn't like coffee'"
      ],
      timestamp: new Date(Date.now() - 7200000)
    }
  ]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<SentenceAnalysis | null>(history[0]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyzeSentence = async () => {
    if (!sentence.trim()) return;

    setIsAnalyzing(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    const newAnalysis: SentenceAnalysis = {
      id: Date.now().toString(),
      original: sentence,
      corrected: sentence.replace(/\bi\b/gi, 'I').replace(/\bdont\b/gi, "don't"),
      mistakes: [
        "Capitalization: 'i' should be capitalized as 'I'",
        "Contraction: 'dont' should have an apostrophe: \"don't\""
      ],
      improvements: [
        "Always capitalize the pronoun 'I'",
        "Use proper punctuation in contractions",
        "Consider adding more descriptive adjectives"
      ],
      timestamp: new Date()
    };

    setHistory([newAnalysis, ...history]);
    setSelectedAnalysis(newAnalysis);
    setSentence('');
    setIsAnalyzing(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Side - Input and History */}
      <div className="space-y-6">
        {/* Input Section */}
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
          
          <Button
            onClick={analyzeSentence}
            disabled={!sentence.trim() || isAnalyzing}
            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl py-6 shadow-md hover:shadow-lg transition-all"
          >
            {isAnalyzing ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
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

        {/* History Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-lg p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-blue-600" />
            <h3>History</h3>
          </div>
          
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            <AnimatePresence>
              {history.map((item, index) => (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => setSelectedAnalysis(item)}
                  className={`w-full text-left p-4 rounded-xl transition-all cursor-pointer ${
                    selectedAnalysis?.id === item.id
                      ? 'bg-gradient-to-r from-blue-100 to-purple-100 border-2 border-blue-400 shadow-md'
                      : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                  }`}
                >
                  <p className="text-sm text-gray-700 line-clamp-2">{item.original}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Right Side - Analysis */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl shadow-lg p-6"
      >
        {selectedAnalysis ? (
          <div className="space-y-6">
            <div>
              <h3 className="mb-3 text-blue-600">Analysis</h3>
              
              {/* Original Sentence */}
              <div className="mb-4 p-4 bg-red-50 rounded-xl border-2 border-red-200">
                <div className="flex items-start gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                  <span className="text-sm text-red-900">Original</span>
                </div>
                <p className="text-gray-800 ml-7">{selectedAnalysis.original}</p>
              </div>

              {/* Corrected Sentence */}
              <div className="p-4 bg-green-50 rounded-xl border-2 border-green-200">
                <div className="flex items-start gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <span className="text-sm text-green-900">Corrected</span>
                </div>
                <p className="text-gray-800 ml-7">{selectedAnalysis.corrected}</p>
              </div>
            </div>

            {/* Mistakes */}
            <div>
              <h4 className="mb-3 text-red-600">Mistakes Found</h4>
              <div className="space-y-2">
                {selectedAnalysis.mistakes.map((mistake, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start gap-3 p-3 bg-red-50 rounded-xl"
                  >
                    <div className="w-6 h-6 bg-red-200 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs text-red-700">{index + 1}</span>
                    </div>
                    <p className="text-sm text-gray-700">{mistake}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Improvements */}
            <div>
              <h4 className="mb-3 text-blue-600">Suggested Improvements</h4>
              <div className="space-y-2">
                {selectedAnalysis.improvements.map((improvement, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl"
                  >
                    <div className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sparkles className="w-3 h-3 text-blue-700" />
                    </div>
                    <p className="text-sm text-gray-700">{improvement}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-gray-400 mb-2">No Analysis Yet</h3>
            <p className="text-sm text-muted-foreground">
              Enter a sentence and click analyze to get started
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
