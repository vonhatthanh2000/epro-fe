import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { CorrectSentence } from '../components/CorrectSentence';
import { WritingGrade } from '../components/WritingGrade';
import { motion } from 'motion/react';
import { BookOpen, LogOut, PenTool, FileText, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ProfileAvatar } from '../components/ProfileAvatar';

export function HomePage() {
  const [activeFeature, setActiveFeature] = useState<'sentence' | 'grade'>('sentence');
  const { user, isSessionLoading, logout } = useAuth();
  const { selectedProfile, selectedProfileId, profilesHydrated } = useProfile();

  const welcomeName =
    user?.name?.trim() || user?.username || (isSessionLoading ? '…' : 'there');
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/', { replace: true });
      return;
    }
    if (!isSessionLoading && profilesHydrated && !selectedProfileId) {
      navigate('/profiles', { replace: true });
    }
  }, [user, isSessionLoading, profilesHydrated, selectedProfileId, navigate]);

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
                Welcome back,{' '}
                <span className="font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  {welcomeName}
                </span>
                !
              </p>
              {selectedProfile && (
                <p className="text-[11px] text-muted-foreground/90 mt-0.5 flex items-center gap-1.5">
                  <ProfileAvatar
                    profile={selectedProfile}
                    sizeClass="w-6 h-6"
                    fallbackTextClassName="text-[9px] font-bold"
                  />
                  Learning as{' '}
                  <span className="font-medium text-gray-700">{selectedProfile.display_name}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <motion.button
              type="button"
              whileHover={{ scale: 1.06, y: -1 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => navigate('/profiles')}
              aria-label="Switch learning profile"
              title="Profiles"
              className="group relative size-11 rounded-xl border border-slate-200/90 bg-white/90 text-slate-600 shadow-sm transition-colors hover:border-indigo-300/80 hover:text-indigo-600 hover:shadow-md hover:shadow-indigo-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500/[0.06] to-violet-500/[0.08] opacity-0 transition-opacity group-hover:opacity-100"
              />
              <Users className="relative mx-auto h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.06, y: -1 }}
              whileTap={{ scale: 0.94 }}
              onClick={handleLogout}
              aria-label="Sign out"
              title="Logout"
              className="relative size-11 rounded-xl border border-slate-200/90 bg-white/90 text-slate-500 shadow-sm transition-colors hover:border-rose-300/90 hover:bg-gradient-to-br hover:from-rose-50 hover:to-orange-50/80 hover:text-rose-600 hover:shadow-md hover:shadow-rose-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            >
              <LogOut className="relative mx-auto h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} />
            </motion.button>
          </div>
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
