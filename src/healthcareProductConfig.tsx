import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, RotateCcw, Settings, ShieldCheck, Clock, Check, AlertCircle } from 'lucide-react';

export type HealthcarePaymentCycle = 'monthly' | '3year';

export interface HealthcareProductConfig {
  id: string;
  prodCode: string;
  prodName: string;
  paymentCycle: HealthcarePaymentCycle;
}

export const HEALTHCARE_PRODUCTS_STORAGE_KEY = 'erp_healthcare_product_configs_v1';
export const HEALTHCARE_PRODUCTS_UPDATED_EVENT = 'healthcareProductConfigsUpdated';

export const DEFAULT_HEALTHCARE_PRODUCT_CONFIGS: HealthcareProductConfig[] = [
  { id: 'hc-a070', prodCode: 'A070', prodName: '더좋은하이브리드698', paymentCycle: '3year' },
  { id: 'hc-a071', prodCode: 'A071', prodName: '더좋은라이즈498', paymentCycle: '3year' },
  { id: 'hc-a072', prodCode: 'A072', prodName: '더좋은프리미엄540', paymentCycle: '3year' },
  { id: 'hc-a073', prodCode: 'A073', prodName: '굿라이프헬스케어실버', paymentCycle: '3year' },
  { id: 'hc-a074', prodCode: 'A074', prodName: '좋은건강크루즈', paymentCycle: 'monthly' },
  { id: 'hc-a075', prodCode: 'A075', prodName: '굿라이프헬스케어골드', paymentCycle: '3year' },
  { id: 'hc-a077', prodCode: 'A077', prodName: '굿라이프헬스케어올인원', paymentCycle: '3year' },
  { id: 'hc-a081', prodCode: 'A081', prodName: '더좋은헬스케어580', paymentCycle: 'monthly' },
];

export const normalizeHealthcareName = (val: string): string =>
  String(val || '').replace(/\s+/g, '').toUpperCase();

export const inferLegacyProductCode = (rawProdName: string): string => {
  const prodName = normalizeHealthcareName(rawProdName);
  if (!prodName) return '';
  if (prodName.includes('하이브리드698')) return 'A070';
  if (prodName.includes('라이즈498')) return 'A071';
  if (prodName.includes('프리미엄540')) return 'A072';
  if (prodName.includes('헬스케어실버') || prodName.includes('실버')) return 'A073';
  if (prodName.includes('좋은건강크루즈') || prodName.includes('크루즈')) return 'A074';
  if (prodName.includes('헬스케어골드') || prodName.includes('골드')) return 'A075';
  if (prodName.includes('올인원') || prodName.includes('ALLINONE') || prodName.includes('ALL-IN-ONE')) return 'A077';
  if (prodName.includes('헬스케어580') || prodName.includes('580')) return 'A081';
  return '';
};

export const sanitizeHealthcareProductConfigs = (rawList: any): HealthcareProductConfig[] => {
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return DEFAULT_HEALTHCARE_PRODUCT_CONFIGS.map(item => ({ ...item }));
  }
  const cleaned: HealthcareProductConfig[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const prodCode = String(item.prodCode || '').trim().toUpperCase();
    const prodName = String(item.prodName || '').trim();
    if (!prodCode && !prodName) continue;
    const paymentCycle: HealthcarePaymentCycle =
      item.paymentCycle === 'monthly' ? 'monthly' : '3year';
    cleaned.push({
      id: String(item.id || `hc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
      prodCode,
      prodName,
      paymentCycle,
    });
  }
  return cleaned.length > 0
    ? cleaned
    : DEFAULT_HEALTHCARE_PRODUCT_CONFIGS.map(item => ({ ...item }));
};

export const loadHealthcareProductConfigs = (): HealthcareProductConfig[] => {
  try {
    const saved = localStorage.getItem(HEALTHCARE_PRODUCTS_STORAGE_KEY);
    if (saved) {
      return sanitizeHealthcareProductConfigs(JSON.parse(saved));
    }
  } catch (e) {
    console.warn('Failed to parse healthcare product configs:', e);
  }
  return DEFAULT_HEALTHCARE_PRODUCT_CONFIGS.map(item => ({ ...item }));
};

let cloudSaveTimer: ReturnType<typeof setTimeout> | null = null;

export const saveHealthcareProductConfigs = (
  configs: HealthcareProductConfig[],
  syncCloud: boolean = true
): HealthcareProductConfig[] => {
  const sanitized = sanitizeHealthcareProductConfigs(configs);
  try {
    localStorage.setItem(HEALTHCARE_PRODUCTS_STORAGE_KEY, JSON.stringify(sanitized));
    window.dispatchEvent(new CustomEvent(HEALTHCARE_PRODUCTS_UPDATED_EVENT, { detail: sanitized }));
    if (syncCloud && typeof (window as any).triggerCloudSettingsSave === 'function') {
      if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
      cloudSaveTimer = setTimeout(() => {
        (window as any).triggerCloudSettingsSave?.(true);
      }, 600);
    }
  } catch (e) {
    console.error('Failed to save healthcare product configs:', e);
  }
  return sanitized;
};

export const useHealthcareProductConfigs = () => {
  const [configs, setConfigs] = useState<HealthcareProductConfig[]>(() => loadHealthcareProductConfigs());

  useEffect(() => {
    const handleUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (Array.isArray(detail)) {
        setConfigs(sanitizeHealthcareProductConfigs(detail));
      } else {
        setConfigs(loadHealthcareProductConfigs());
      }
    };
    const handleCloudLoaded = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.healthcareProducts && Array.isArray(detail.healthcareProducts)) {
        const sanitized = sanitizeHealthcareProductConfigs(detail.healthcareProducts);
        setConfigs(sanitized);
      }
    };
    window.addEventListener(HEALTHCARE_PRODUCTS_UPDATED_EVENT, handleUpdated);
    window.addEventListener('cloudSettingsLoaded', handleCloudLoaded);
    return () => {
      window.removeEventListener(HEALTHCARE_PRODUCTS_UPDATED_EVENT, handleUpdated);
      window.removeEventListener('cloudSettingsLoaded', handleCloudLoaded);
    };
  }, []);

  const updateConfigs = (next: HealthcareProductConfig[], syncCloud: boolean = true) => {
    const saved = saveHealthcareProductConfigs(next, syncCloud);
    setConfigs(saved);
    return saved;
  };

  return { configs, setConfigs: updateConfigs };
};

export interface ResolvedHealthcareProductInfo {
  prodCode: string;
  paymentCycle: HealthcarePaymentCycle;
  isMonthly: boolean;
  matchedConfig: HealthcareProductConfig | null;
}

export const resolveHealthcareProductInfo = (
  rawProdName: string,
  configs: HealthcareProductConfig[]
): ResolvedHealthcareProductInfo => {
  const normInput = normalizeHealthcareName(rawProdName);
  const inferredCode = inferLegacyProductCode(rawProdName);
  const activeConfigs = configs && configs.length > 0 ? configs : DEFAULT_HEALTHCARE_PRODUCT_CONFIGS;

  let matched: HealthcareProductConfig | null = null;

  // 1) 상품명 정확 일치
  if (normInput) {
    matched =
      activeConfigs.find(c => normalizeHealthcareName(c.prodName) === normInput) || null;
  }

  // 2) 상품명 부분 일치 (더 구체적인 긴 이름 우선)
  if (!matched && normInput) {
    const partialMatches = activeConfigs
      .filter(c => {
        const normCfg = normalizeHealthcareName(c.prodName);
        return normCfg.length >= 2 && (normInput.includes(normCfg) || normCfg.includes(normInput));
      })
      .sort((a, b) => normalizeHealthcareName(b.prodName).length - normalizeHealthcareName(a.prodName).length);
    if (partialMatches.length > 0) {
      matched = partialMatches[0];
    }
  }

  // 3) 상품코드 일치 (입력 텍스트 내 코드 포함 또는 레거시 추정 코드 일치)
  if (!matched) {
    const codeTarget = inferredCode || normInput;
    matched =
      activeConfigs.find(c => {
        const code = String(c.prodCode || '').trim().toUpperCase();
        return code && (code === codeTarget || normInput === code || normInput.includes(code));
      }) || null;
  }

  const prodCode = (matched?.prodCode || inferredCode || '').trim();
  const paymentCycle: HealthcarePaymentCycle = matched ? matched.paymentCycle : '3year';

  return {
    prodCode,
    paymentCycle,
    isMonthly: paymentCycle === 'monthly',
    matchedConfig: matched,
  };
};

interface HealthcareProductSettingsPanelProps {
  configs: HealthcareProductConfig[];
  onChange: (nextConfigs: HealthcareProductConfig[]) => void;
  detectedProductNames?: string[];
  onSaveToCloud?: () => void;
  showHeader?: boolean;
}

export const HealthcareProductSettingsPanel: React.FC<HealthcareProductSettingsPanelProps> = ({
  configs,
  onChange,
  detectedProductNames = [],
  onSaveToCloud,
  showHeader = true,
}) => {
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newCycle, setNewCycle] = useState<HealthcarePaymentCycle>('monthly');
  const [formError, setFormError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const monthlyCount = useMemo(
    () => configs.filter(c => c.paymentCycle === 'monthly').length,
    [configs]
  );
  const threeYearCount = useMemo(
    () => configs.filter(c => c.paymentCycle === '3year').length,
    [configs]
  );

  const unregisteredProducts = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const rawName of detectedProductNames) {
      const trimmed = String(rawName || '').trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      const resolved = resolveHealthcareProductInfo(trimmed, configs);
      if (!resolved.matchedConfig) {
        list.push(trimmed);
      }
    }
    return list;
  }, [detectedProductNames, configs]);

  const notifySaved = (msg: string) => {
    setSavedToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setSavedToast(null), 2500);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const code = newCode.trim().toUpperCase();
    const name = newName.trim();
    if (!code && !name) {
      setFormError('상품코드 또는 상품명을 입력해 주세요.');
      return;
    }
    const isDuplicateName = name && configs.some(
      c => normalizeHealthcareName(c.prodName) === normalizeHealthcareName(name)
    );
    if (isDuplicateName) {
      setFormError(`"${name}" 상품명이 이미 등록되어 있습니다.`);
      return;
    }

    const next: HealthcareProductConfig[] = [
      ...configs,
      {
        id: `hc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        prodCode: code,
        prodName: name || code,
        paymentCycle: newCycle,
      },
    ];
    onChange(next);
    setNewCode('');
    setNewName('');
    setFormError(null);
    notifySaved('상품이 추가되고 저장되었습니다.');
  };

  const handleUpdateItem = (id: string, patch: Partial<HealthcareProductConfig>, showToast = false) => {
    const next = configs.map(c => (c.id === id ? { ...c, ...patch } : c));
    onChange(next);
    if (showToast) {
      notifySaved('납입구분이 변경되어 즉시 반영되었습니다.');
    }
  };

  const handleDelete = (id: string) => {
    const next = configs.filter(c => c.id !== id);
    if (next.length === 0) {
      setFormError('최소 1개 이상의 상품 설정이 필요합니다.');
      return;
    }
    setFormError(null);
    onChange(next);
    notifySaved('항목이 삭제되었습니다.');
  };

  const handleResetDefault = () => {
    const reset = DEFAULT_HEALTHCARE_PRODUCT_CONFIGS.map(c => ({ ...c }));
    setFormError(null);
    onChange(reset);
    notifySaved('기본 설정(A081·A074 월납 / 그 외 3년납 이후 월납)으로 복원되었습니다.');
  };

  return (
    <div className="space-y-5">
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Settings size={18} className="text-purple-600" />
              헬스케어 상품별 납입구분 설정
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              상품코드와 상품명 기준으로 <strong>월납</strong> 상품과 <strong>3년납 이후 월납</strong> 상품을 구분합니다. 변경사항은 헬스케어 명단 조회, 엑셀 시트 구분, 월납 대상자 화면에 즉시 반영됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800 border border-purple-200 text-xs font-bold">
              월납: {monthlyCount}개
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold">
              3년납 이후 월납: {threeYearCount}개
            </span>
            <button
              type="button"
              onClick={handleResetDefault}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="기본 상품 목록으로 초기화"
            >
              <RotateCcw size={13} />
              기본값 복원
            </button>
            {onSaveToCloud && (
              <button
                type="button"
                onClick={onSaveToCloud}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                <Check size={13} />
                클라우드 저장
              </button>
            )}
          </div>
        </div>
      )}

      {savedToast && (
        <div className="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <Check size={14} className="text-emerald-600 shrink-0" />
          <span>{savedToast}</span>
        </div>
      )}

      {formError && (
        <div className="px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
          <AlertCircle size={14} className="text-rose-600 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {unregisteredProducts.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-amber-900">미등록 상품 감지됨 (클릭하여 추가 폼에 입력):</span>
          {unregisteredProducts.map(name => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setNewName(name);
                const inferred = inferLegacyProductCode(name);
                if (inferred) setNewCode(inferred);
                setFormError(null);
              }}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-semibold cursor-pointer transition-colors"
            >
              + {name}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
        <div className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
          <Plus size={14} className="text-blue-600" />
          신규 헬스케어 상품 등록
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold text-slate-500 mb-1">상품코드</label>
            <input
              type="text"
              value={newCode}
              onChange={(e) => {
                setNewCode(e.target.value);
                setFormError(null);
              }}
              placeholder="예: A082"
              className="w-full px-3 py-2 text-xs font-bold uppercase bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-[11px] font-bold text-slate-500 mb-1">상품명</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setFormError(null);
              }}
              placeholder="예: 더좋은헬스케어580"
              className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold text-slate-500 mb-1">납입구분</label>
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setNewCycle('monthly')}
                className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                  newCycle === 'monthly'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-purple-700'
                }`}
              >
                월납
              </button>
              <button
                type="button"
                onClick={() => setNewCycle('3year')}
                className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                  newCycle === '3year'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-sky-700'
                }`}
              >
                3년납 이후 월납
              </button>
            </div>
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Plus size={14} />
              상품 추가
            </button>
          </div>
        </div>
      </form>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-100 text-slate-600 text-[11px] font-bold border-b border-slate-200">
            <tr>
              <th className="px-4 py-2.5 w-14 text-center">순번</th>
              <th className="px-4 py-2.5 w-36">상품코드</th>
              <th className="px-4 py-2.5">상품명</th>
              <th className="px-4 py-2.5 w-72 text-center">납입구분 (월납 / 3년납 이후 월납)</th>
              <th className="px-4 py-2.5 w-20 text-center">삭제</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {configs.map((item, idx) => (
              <tr
                key={item.id}
                className={item.paymentCycle === 'monthly' ? 'bg-purple-50/30 hover:bg-purple-50/60' : 'hover:bg-slate-50'}
              >
                <td className="px-4 py-2.5 text-center text-slate-400 font-bold">{idx + 1}</td>
                <td className="px-4 py-2.5">
                  <input
                    type="text"
                    value={item.prodCode}
                    onChange={(e) => handleUpdateItem(item.id, { prodCode: e.target.value.toUpperCase() })}
                    placeholder="상품코드"
                    className="w-full px-2.5 py-1.5 text-xs font-bold uppercase bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="text"
                    value={item.prodName}
                    onChange={(e) => handleUpdateItem(item.id, { prodName: e.target.value })}
                    placeholder="상품명"
                    className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => handleUpdateItem(item.id, { paymentCycle: 'monthly' }, true)}
                      className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        item.paymentCycle === 'monthly'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-purple-700'
                      }`}
                    >
                      <ShieldCheck size={12} />
                      월납
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateItem(item.id, { paymentCycle: '3year' }, true)}
                      className={`py-1.5 px-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        item.paymentCycle === '3year'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-sky-700'
                      }`}
                    >
                      <Clock size={12} />
                      3년납 이후 월납
                    </button>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="삭제"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface HealthcareProductSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  configs: HealthcareProductConfig[];
  onChange: (nextConfigs: HealthcareProductConfig[]) => void;
  detectedProductNames?: string[];
}

export const HealthcareProductSettingsModal: React.FC<HealthcareProductSettingsModalProps> = ({
  isOpen,
  onClose,
  configs,
  onChange,
  detectedProductNames = [],
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden border border-slate-200"
        >
          <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-purple-600 rounded-xl">
                <Settings size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold">헬스케어 상품 납입구분 설정</h3>
                <p className="text-[11px] text-slate-400">상품코드·상품명별 월납 / 3년납 이후 월납 구분을 관리합니다.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            <HealthcareProductSettingsPanel
              configs={configs}
              onChange={onChange}
              detectedProductNames={detectedProductNames}
              showHeader={true}
            />
          </div>

          <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              변경사항은 즉시 적용되며, 구글 시트 연동 시 클라우드에도 자동 저장됩니다.
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              닫기
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
