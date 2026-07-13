import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, HelpCircle, X } from 'lucide-react';

interface CustomDialogProps {
  isOpen: boolean;
  type: 'alert' | 'confirm';
  title?: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const CustomDialog: React.FC<CustomDialogProps> = ({
  isOpen,
  type,
  title,
  message,
  onConfirm,
  onCancel
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full overflow-hidden flex flex-col p-6 gap-4"
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  type === 'confirm' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                }`}>
                  {type === 'confirm' ? <HelpCircle size={20} /> : <AlertCircle size={20} />}
                </div>
                <h3 className="text-base font-black text-slate-800 tracking-tight">
                  {title || (type === 'confirm' ? '확인' : '알림')}
                </h3>
              </div>
              <button 
                onClick={onCancel}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Message */}
            <div className="text-[13px] font-medium text-slate-600 leading-relaxed whitespace-pre-line py-2">
              {message}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 mt-2 shrink-0">
              {type === 'confirm' && (
                <button
                  onClick={onCancel}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-bold rounded-lg transition-colors"
                >
                  취소
                </button>
              )}
              <button
                onClick={onConfirm}
                className={`px-4 py-2 text-white text-[13px] font-bold rounded-lg transition-colors ${
                  type === 'confirm' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-500 hover:bg-amber-600'
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
