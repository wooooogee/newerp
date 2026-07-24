import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, HelpCircle, X, Edit3 } from 'lucide-react';

interface CustomDialogProps {
  isOpen: boolean;
  type: 'alert' | 'confirm' | 'prompt';
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

export const CustomDialog: React.FC<CustomDialogProps> = ({
  isOpen,
  type,
  title,
  message,
  defaultValue = '',
  placeholder = '내용을 입력하세요...',
  onConfirm,
  onCancel
}) => {
  const [inputVal, setInputVal] = React.useState(defaultValue);

  React.useEffect(() => {
    if (isOpen) {
      setInputVal(defaultValue);
    }
  }, [isOpen, defaultValue]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden flex flex-col p-6 gap-4"
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  type === 'confirm' 
                    ? 'bg-blue-50 text-blue-600' 
                    : type === 'prompt'
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'bg-amber-50 text-amber-600'
                }`}>
                  {type === 'confirm' ? (
                    <HelpCircle size={20} />
                  ) : type === 'prompt' ? (
                    <Edit3 size={18} />
                  ) : (
                    <AlertCircle size={20} />
                  )}
                </div>
                <h3 className="text-sm font-black text-slate-800 tracking-tight">
                  {title || (type === 'confirm' ? '확인' : type === 'prompt' ? '입력' : '알림')}
                </h3>
              </div>
              <button 
                onClick={onCancel}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-50 rounded-xl transition-all active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            {/* Message */}
            <div className="text-[13px] font-bold text-slate-600 leading-relaxed whitespace-pre-line px-1">
              {message}
            </div>

            {/* Input field for Prompts */}
            {type === 'prompt' && (
              <div className="mt-1 px-1">
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder={placeholder}
                  className="w-full p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition-all"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onConfirm(inputVal);
                    }
                  }}
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 mt-2 shrink-0">
              {(type === 'confirm' || type === 'prompt') && (
                <button
                  onClick={onCancel}
                  className="px-4.5 py-2.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-black rounded-xl transition-all active:scale-95"
                >
                  취소
                </button>
              )}
              <button
                onClick={() => onConfirm(type === 'prompt' ? inputVal : undefined)}
                className={`px-5 py-2.5 text-white text-xs font-black rounded-xl transition-all shadow-sm active:scale-95 ${
                  type === 'confirm' 
                    ? 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-100 shadow-md' 
                    : type === 'prompt'
                      ? 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-100 shadow-md'
                      : 'bg-amber-500 hover:bg-amber-600 hover:shadow-amber-100 shadow-md'
                }`}
              >
                확인
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
