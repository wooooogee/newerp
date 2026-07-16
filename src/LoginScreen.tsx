import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, User, AlertCircle, Save } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (user: { username: string; role: string; orgName: string; orgs?: { role: string; orgName: string; }[] }) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        onLoginSuccess(data.user);
      } else {
        setError(data.error || '로그인에 실패했습니다. 다시 시도해 주세요.');
      }
    } catch (err) {
      console.error(err);
      setError('서버와의 연결이 원활하지 않습니다. 네트워크 상태를 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#090d16] overflow-hidden font-sans">
      {/* Background Decorative Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-purple-600/10 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-md p-8 bg-slate-900/60 border border-slate-800 rounded-3xl backdrop-blur-xl shadow-2xl relative z-10 mx-4"
      >
        {/* Brand Logo & Title */}
        <div className="flex flex-col items-center mb-8">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4"
          >
            <Save size={24} className="text-white" strokeWidth={2.5} />
          </motion.div>
          <h2 className="text-2xl font-black tracking-tight text-white mb-1.5">
            The Better Life ERP
          </h2>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            영업 조직별 대시보드 시스템
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl text-[13px] font-medium"
            >
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider pl-1">
              아이디 (ID)
            </label>
            <div className="relative">
              <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="아이디를 입력하세요"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="w-full pl-11 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-2xl text-[13px] text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider pl-1">
              비밀번호 (Password)
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full pl-11 pr-4 py-3 bg-slate-950/40 border border-slate-800 rounded-2xl text-[13px] text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
              />
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.99 }}
            type="submit"
            disabled={loading}
            className="w-full py-3.5 mt-2 bg-blue-600 text-white rounded-2xl text-[13px] font-bold shadow-lg shadow-blue-500/10 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none transition-all flex items-center justify-center"
          >
            {loading ? (
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              '로그인'
            )}
          </motion.button>
        </form>

        {/* Footer Credit */}
        <div className="mt-8 text-center text-[10px] text-slate-500 font-semibold tracking-wide">
          © 2026 The Better Life. All rights reserved.
        </div>
      </motion.div>
    </div>
  );
};
