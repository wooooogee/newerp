import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, HelpCircle, X, Edit3, AlertTriangle, Trash2, CheckCircle2 } from 'lucide-react';

export interface CustomDialogProps {
  isOpen: boolean;
  type: 'alert' | 'confirm' | 'prompt' | 'danger';
  title?: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
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
  confirmText,
  cancelText,
  onConfirm,
  onCancel
}) => {
  const [inputVal, setInputVal] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) {
      setInputVal(defaultValue);
    }
  }, [isOpen, defaultValue]);

  // ESC 키로 닫기, Enter 키로 확인 지원
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter' && type !== 'prompt') {
        onConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, onConfirm, type]);

  // 메시지 내용 및 타입에 따른 시각적 톤 자동 판정
  const isDanger = type === 'danger' || 
    message.includes('삭제') || 
    (title && title.includes('삭제')) || 
    message.includes('초기화');

  const isWarning = !isDanger && (
    message.includes('저장되지 않은') || 
    message.includes('변경사항') || 
    message.includes('주의') || 
    message.includes('경고') ||
    (title && (title.includes('주의') || title.includes('경고') || title.includes('미저장')))
  );

  const getIconContainerClass = () => {
    if (isDanger) return 'bg-rose-50 text-rose-600 border border-rose-100 shadow-sm';
    if (isWarning) return 'bg-amber-50 text-amber-600 border border-amber-100 shadow-sm';
    if (type === 'prompt') return 'bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm';
    if (type === 'alert') return 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm';
    return 'bg-blue-50 text-blue-600 border border-blue-100 shadow-sm';
  };

  const renderIcon = () => {
    if (isDanger) return <Trash2 size={22} className="shrink-0" />;
    if (isWarning) return <AlertTriangle size={22} className="shrink-0" />;
    if (type === 'prompt') return <Edit3 size={20} className="shrink-0" />;
    if (type === 'alert') return <AlertCircle size={22} className="shrink-0" />;
    return <HelpCircle size={22} className="shrink-0" />;
  };

  const getTitle = () => {
    if (title) return title;
    if (isDanger) return '삭제 확인';
    if (isWarning) return '확인 필요';
    if (type === 'prompt') return '입력';
    if (type === 'alert') return '안내';
    return '확인';
  };

  const getConfirmButtonClass = () => {
    if (isDanger) return 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/25';
    if (isWarning) return 'bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/25';
    if (type === 'prompt') return 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/25';
    return 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 overflow-x-hidden overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={type === 'alert' ? () => onConfirm() : onCancel}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 12 }}
            transition={{ type: 'spring', duration: 0.25, bounce: 0.15 }}
            className="relative bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border border-slate-100 max-w-md w-full overflow-hidden flex flex-col p-6 sm:p-7 gap-5 z-10"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${getIconContainerClass()}`}>
                  {renderIcon()}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight leading-snug">
                    {getTitle()}
                  </h3>
                  <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                    더좋은라이프 ERP 시스템 알림
                  </p>
                </div>
              </div>
              <button 
                onClick={onCancel}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-full transition-all active:scale-95 cursor-pointer -mt-1 -mr-1"
                title="닫기 (ESC)"
              >
                <X size={18} />
              </button>
            </div>

            {/* Message Body */}
            <div className="text-[13.5px] font-medium text-slate-600 leading-relaxed whitespace-pre-line px-1 break-keep">
              {message}
            </div>

            {/* Input field for Prompts */}
            {type === 'prompt' && (
              <div className="mt-0.5 px-1">
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder={placeholder}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition-all"
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
            <div className="flex items-center justify-end gap-2.5 mt-2 pt-2 border-t border-slate-100 shrink-0">
              {(type === 'confirm' || type === 'prompt' || isDanger || isWarning) && type !== 'alert' && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
                >
                  {cancelText || '취소'}
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={() => onConfirm(type === 'prompt' ? inputVal : undefined)}
                className={`px-5 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer ${getConfirmButtonClass()}`}
              >
                {confirmText || (isDanger ? '삭제' : (isWarning ? '확인' : '확인'))}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

/**
 * 전역 편의 유틸리티 함수
 */
export const customConfirm = (message: string, title?: string): Promise<boolean> => {
  if (typeof window !== 'undefined' && (window as any).customConfirm) {
    return (window as any).customConfirm(message, title);
  }
  return Promise.resolve(window.confirm(message));
};

export const customAlert = (message: string, title?: string): Promise<boolean> => {
  if (typeof window !== 'undefined' && (window as any).customAlert) {
    return (window as any).customAlert(message, title);
  }
  window.alert(message);
  return Promise.resolve(true);
};
