import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { CorrectSentence } from '../components/CorrectSentence';
import { WritingGrade } from '../components/WritingGrade';
import { Button } from '../components/ui/button';
import { motion } from 'motion/react';
import { BookOpen, LogOut, PenTool, FileText } from 'lucide-react';
import { useNavigate } from 'react-router';

export function HomePage() {
  const [activeFeature, setActiveFeature] = useState<'sentence' | 'grade'>('sentence');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                EPro
              </h1>
              <p className="text-xs text-muted-foreground">
                Welcome back, {user?.name?.trim() || user?.username}!
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="rounded-xl border-2 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-all"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Feature Selection */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-4 mb-8"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveFeature('sentence')}
            className={`flex-1 p-6 rounded-2xl transition-all duration-300 ${
              activeFeature === 'sentence'
                ? 'bg-gradient-to-br from-blue-400 to-purple-500 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:shadow-md'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  activeFeature === 'sentence' ? 'bg-white/20' : 'bg-blue-100'
                }`}
              >
                <PenTool
                  className={`w-6 h-6 ${activeFeature === 'sentence' ? 'text-white' : 'text-blue-600'}`}
                />
              </div>
              <div className="text-left">
                <h3>Correct Sentence</h3>
                <p className={`text-sm ${activeFeature === 'sentence' ? 'text-white/80' : 'text-muted-foreground'}`}>
                  Fix grammar and improve writing
                </p>
              </div>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveFeature('grade')}
            className={`flex-1 p-6 rounded-2xl transition-all duration-300 ${
              activeFeature === 'grade'
                ? 'bg-gradient-to-br from-pink-400 to-orange-400 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:shadow-md'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  activeFeature === 'grade' ? 'bg-white/20' : 'bg-pink-100'
                }`}
              >
                <FileText
                  className={`w-6 h-6 ${activeFeature === 'grade' ? 'text-white' : 'text-pink-600'}`}
                />
              </div>
              <div className="text-left">
                <h3>Writing Grade</h3>
                <p className={`text-sm ${activeFeature === 'grade' ? 'text-white/80' : 'text-muted-foreground'}`}>
                  Evaluate your writing quality
                </p>
              </div>
            </div>
          </motion.button>
        </motion.div>

        {/* Feature Content */}
        <motion.div
          key={activeFeature}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeFeature === 'sentence' ? <CorrectSentence /> : <WritingGrade />}
        </motion.div>
      </main>
    </div>
  );
}
