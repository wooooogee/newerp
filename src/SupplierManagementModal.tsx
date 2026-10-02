import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, Building, Plus, Trash2, Edit3, Save, Check, RefreshCw, 
  Package, CreditCard, DollarSign, Search, Phone, User, Calendar, 
  FileText, CheckCircle2, ChevronRight, Cloud, DownloadCloud, UploadCloud, 
  AlertCircle, Layers, Tag, HelpCircle, ChevronDown, CheckSquare, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface HqCommissionSetting {
  id: string;
  hqName: string;       // 본부명 (예: 맥스, 무한, 스타, 에이스 등 또는 '전체본부')
  commission: number;   // 해당 본부에 적용할 수수료 (VAT 포함)
  memo?: string;
}

export interface SupplierProductSetting {
  id: string;
  productKeyword: string; // 매칭 키워드 (렌탈상품명 등에 포함된 단어)
  productName: string;    // 공식 표시 제품명
  supplyPrice: number;    // 공급 단가 (VAT 포함)
  supplyCommission: number; // 보조 기본 수수료 (전체본부 설정 시 호환)
  hqCommissions?: HqCommissionSetting[]; // 지급 대상 본부 및 수수료 설정 (선택한 곳만 지급)
  commissionRecipient?: string; // 수수료 수령 대상 (공급사 직접 또는 지정인/법인)
  recipientBank?: string;
  recipientAccount?: string;
  recipientHolder?: string;
  memo?: string;
}

export interface SupplierItem {
  id: string;
  name: string;          // 공급사명
  businessNo: string;    // 사업자등록번호
  ceoName: string;       // 대표자명
  managerName: string;   // 담당자명
  managerPhone: string;  // 담당자 연락처
  managerEmail: string;  // 담당자 이메일
  bankName: string;      // 거래 은행
  accountNumber: string; // 계좌번호
  accountHolder: string; // 예금주
  settlementDay: number; // 정산 지급일 (기본: 말일)
  memo: string;          // 메모
  isActive: boolean;     // 사용 여부
  createdAt: string;     // 생성일
  products: SupplierProductSetting[]; // 취급 제품 및 단가/수수료 설정
}

// 로컬 스토리지 키
export const SUPPLIER_STORAGE_KEY = 'erp_suppliers_master_v3';

// 초기값
export const INITIAL_SUPPLIERS: SupplierItem[] = [];

// 로컬 스토리지에서 공급사 로드
export const loadSuppliersFromStorage = (): SupplierItem[] => {
  try {
    const saved = localStorage.getItem(SUPPLIER_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load suppliers:', e);
  }
  return [];
};

// 로컬 스토리지에 공급사 저장
export const saveSuppliersToStorage = (suppliers: SupplierItem[]): void => {
  try {
    localStorage.setItem(SUPPLIER_STORAGE_KEY, JSON.stringify(suppliers));
  } catch (e) {
    console.error('Failed to save suppliers:', e);
  }
};

interface SupplierManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuppliersUpdated?: (suppliers: SupplierItem[]) => void;
  availableProducts?: string[];
  availableHqs?: string[];
}

export const SupplierManagementModal: React.FC<SupplierManagementModalProps> = ({
  isOpen,
  onClose,
  onSuppliersUpdated,
  availableProducts = [],
  availableHqs = []
}) => {
  const [suppliers, setSuppliers] = useState<SupplierItem[]>(() => loadSuppliersFromStorage());
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);

  // 신규/수정 공급사 폼 상태
  const [isEditingSupplier, setIsEditingSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState<Partial<SupplierItem>>({
    name: '',
    businessNo: '',
    ceoName: '',
    managerName: '',
    managerPhone: '',
    managerEmail: '',
    bankName: '',
    accountNumber: '',
    accountHolder: '',
    settlementDay: 31,
    memo: '',
    isActive: true,
  });

  // 제품 추가/수정 모달 상태
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductIdx, setEditingProductIdx] = useState<number | null>(null);
  const [productForm, setProductForm] = useState<Partial<SupplierProductSetting>>({
    productKeyword: '',
    productName: '',
    supplyPrice: 0,
    supplyCommission: 0,
    hqCommissions: [],
    commissionRecipient: '',
    recipientBank: '',
    recipientAccount: '',
    recipientHolder: '',
    memo: ''
  });

  // 제품 선택 드롭다운 상태
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [isDirectInputMode, setIsDirectInputMode] = useState(false);
  const productPickerRef = useRef<HTMLDivElement>(null);

  // 본부별 수수료 다중 선택 필드
  const [selectedHqsForCommission, setSelectedHqsForCommission] = useState<string[]>([]);
  const [tempHqCommission, setTempHqCommission] = useState<number | ''>('');
  const [customHqInput, setCustomHqInput] = useState('');
  const [customHqList, setCustomHqList] = useState<string[]>([]);

  // 선택 가능한 모든 본부 후보 (availableHqs + 커스텀 추가 + 기존 등록)
  const allHqCandidates = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();

    // 1) availableHqs
    availableHqs.forEach(h => {
      const trimmed = h.trim();
      if (trimmed && trimmed !== '전체' && trimmed !== '전체본부' && !seen.has(trimmed)) {
        seen.add(trimmed);
        list.push(trimmed);
      }
    });

    // 2) customHqList
    customHqList.forEach(h => {
      const trimmed = h.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        list.push(trimmed);
      }
    });

    // 3) productForm.hqCommissions 에 이미 존재하는 본부
    (productForm.hqCommissions || []).forEach(h => {
      const trimmed = (h.hqName || '').trim();
      if (trimmed && trimmed !== '전체' && trimmed !== '전체본부' && !seen.has(trimmed)) {
        seen.add(trimmed);
        list.push(trimmed);
      }
    });

    return list;
  }, [availableHqs, customHqList, productForm.hqCommissions]);

  // 등록된 본부 수수료를 금액별로 그룹화 (A,B,C는 5000원, E,F,G는 10000원 등 한눈에 확인)
  const groupedHqCommissions = useMemo(() => {
    const map = new Map<number, HqCommissionSetting[]>();

    (productForm.hqCommissions || []).forEach(item => {
      const comm = item.commission || 0;
      const arr = map.get(comm) || [];
      arr.push(item);
      map.set(comm, arr);
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => b - a)
      .map(([commission, items]) => ({ commission, items }));
  }, [productForm.hqCommissions]);

  useEffect(() => {
    if (isOpen) {
      const loaded = loadSuppliersFromStorage();
      setSuppliers(loaded);
      if (loaded.length > 0) {
        if (!selectedSupplierId || !loaded.some(s => s.id === selectedSupplierId)) {
          setSelectedSupplierId(loaded[0].id);
        }
      } else {
        setSelectedSupplierId('');
      }
    }
  }, [isOpen]);

  // 제품 드롭다운 바깥 클릭 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (productPickerRef.current && !productPickerRef.current.contains(e.target as Node)) {
        setIsProductPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 구글 시트에서 공급사 DB 불러오기
  const handleLoadFromGoogleSheet = async () => {
    try {
      setIsCloudSyncing(true);
      setCloudMessage('구글 시트에서 공급사 목록을 불러오는 중...');
      const res = await fetch('/api/sheets/suppliers/load');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '구글 시트 연동 실패');
      }
      const data = await res.json();
      const loadedSuppliers: SupplierItem[] = Array.isArray(data.suppliers) ? data.suppliers : [];
      
      setSuppliers(loadedSuppliers);
      saveSuppliersToStorage(loadedSuppliers);
      onSuppliersUpdated?.(loadedSuppliers);

      if (loadedSuppliers.length > 0) {
        setSelectedSupplierId(loadedSuppliers[0].id);
        setCloudMessage(`구글 시트에서 ${loadedSuppliers.length}개 공급사를 성공적으로 불러왔습니다.`);
      } else {
        setCloudMessage('구글 시트의 [공급사관리] 탭에 등록된 공급사 데이터가 없습니다.');
      }
      setTimeout(() => setCloudMessage(null), 4000);
    } catch (err: any) {
      console.error(err);
      alert(`구글 시트 불러오기 오류: ${err.message || err}`);
      setCloudMessage(null);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // 구글 시트에 공급사 DB 전체 저장하기
  const handleSaveToGoogleSheet = async () => {
    if (suppliers.length === 0) {
      if (!window.confirm('저장할 공급사가 비어 있습니다. 구글 시트의 [공급사관리] 탭도 비우시겠습니까?')) {
        return;
      }
    } else {
      if (!window.confirm(`현재 등록된 ${suppliers.length}개 공급사 정보를 구글 시트 [공급사관리] 탭에 저장하시겠습니까?`)) {
        return;
      }
    }

    try {
      setIsCloudSyncing(true);
      setCloudMessage('구글 시트에 공급사 데이터를 동기화 저장 중...');
      const res = await fetch('/api/sheets/suppliers/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suppliers })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '구글 시트 저장 실패');
      }
      setCloudMessage(`구글 시트 [공급사관리] 탭에 ${suppliers.length}개 공급사가 안전하게 저장되었습니다.`);
      setTimeout(() => setCloudMessage(null), 4000);
    } catch (err: any) {
      console.error(err);
      alert(`구글 시트 저장 오류: ${err.message || err}`);
      setCloudMessage(null);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // 선택된 공급사
  const activeSupplier = suppliers.find(s => s.id === selectedSupplierId) || suppliers[0];

  const handleSelectSupplier = (supplier: SupplierItem) => {
    setSelectedSupplierId(supplier.id);
    setIsEditingSupplier(false);
  };

  // 공급사 저장
  const handleSaveSupplier = () => {
    if (!supplierForm.name?.trim()) {
      alert('공급사명을 입력해주세요.');
      return;
    }

    let updatedList: SupplierItem[];
    if (isEditingSupplier && selectedSupplierId) {
      // 기존 수정
      updatedList = suppliers.map(s => {
        if (s.id === selectedSupplierId) {
          return {
            ...s,
            ...supplierForm,
            name: supplierForm.name!.trim(),
            products: s.products || []
          } as SupplierItem;
        }
        return s;
      });
    } else {
      // 신규 추가
      const newSupplier: SupplierItem = {
        id: `supp-${Date.now()}`,
        name: supplierForm.name.trim(),
        businessNo: supplierForm.businessNo || '',
        ceoName: supplierForm.ceoName || '',
        managerName: supplierForm.managerName || '',
        managerPhone: supplierForm.managerPhone || '',
        managerEmail: supplierForm.managerEmail || '',
        bankName: supplierForm.bankName || '',
        accountNumber: supplierForm.accountNumber || '',
        accountHolder: supplierForm.accountHolder || '',
        settlementDay: supplierForm.settlementDay || 31,
        memo: supplierForm.memo || '',
        isActive: true,
        createdAt: new Date().toISOString().slice(0, 10),
        products: []
      };
      updatedList = [...suppliers, newSupplier];
      setSelectedSupplierId(newSupplier.id);
    }

    setSuppliers(updatedList);
    saveSuppliersToStorage(updatedList);
    onSuppliersUpdated?.(updatedList);
    setIsEditingSupplier(false);
  };

  // 공급사 삭제
  const handleDeleteSupplier = (id: string, name: string) => {
    if (!window.confirm(`'${name}' 공급사를 삭제하시겠습니까?\n취급 제품 및 단가 설정도 함께 삭제됩니다.`)) return;
    const filtered = suppliers.filter(s => s.id !== id);
    setSuppliers(filtered);
    saveSuppliersToStorage(filtered);
    onSuppliersUpdated?.(filtered);
    if (selectedSupplierId === id) {
      setSelectedSupplierId(filtered.length > 0 ? filtered[0].id : '');
    }
  };

  // 제품 선택 핸들러 (드롭다운에서 정확한 제품명 클릭 시)
  const handleSelectProductFromList = (prodName: string) => {
    setProductForm({
      ...productForm,
      productKeyword: prodName,
      productName: prodName
    });
    setIsProductPickerOpen(false);
    setProductSearchTerm('');
  };

  // 본부 선택 토글
  const handleToggleHqSelection = (hq: string) => {
    setSelectedHqsForCommission(prev => {
      if (prev.includes(hq)) {
        return prev.filter(h => h !== hq);
      } else {
        return [...prev, hq];
      }
    });
  };

  // 모든 후보 본부 전체 선택
  const handleSelectAllHqs = () => {
    setSelectedHqsForCommission([...allHqCandidates]);
  };

  // 본부 선택 전체 해제
  const handleDeselectAllHqs = () => {
    setSelectedHqsForCommission([]);
  };

  // 목록에 없는 본부 직접 입력 추가
  const handleAddCustomHq = () => {
    const trimmed = customHqInput.trim();
    if (!trimmed) return;
    if (!customHqList.includes(trimmed)) {
      setCustomHqList(prev => [...prev, trimmed]);
    }
    if (!selectedHqsForCommission.includes(trimmed)) {
      setSelectedHqsForCommission(prev => [...prev, trimmed]);
    }
    setCustomHqInput('');
  };

  // 선택한 여러 본부에 수수료 금액 일괄 적용/추가
  const handleApplyMultiHqCommission = () => {
    if (selectedHqsForCommission.length === 0) {
      alert('수수료를 적용할 지급 대상 본부를 1개 이상 선택해주세요.');
      return;
    }
    const commVal = Number(tempHqCommission);
    if (tempHqCommission === '' || isNaN(commVal) || commVal < 0) {
      alert('올바른 수수료 금액(원, VAT포함)을 입력해주세요.');
      return;
    }

    const currentList = productForm.hqCommissions || [];
    const selectedNormalized = new Set(selectedHqsForCommission.map(h => h.trim().toLowerCase()));

    // 선택되지 않은 기존 항목 유지
    const remaining = currentList.filter(h => !selectedNormalized.has(h.hqName.trim().toLowerCase()));

    // 선택된 본부들에 대해 새로 생성/업데이트
    const updatedNewItems: HqCommissionSetting[] = selectedHqsForCommission.map((hq, idx) => ({
      id: `hq-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      hqName: hq.trim(),
      commission: commVal
    }));

    setProductForm({
      ...productForm,
      hqCommissions: [...remaining, ...updatedNewItems]
    });

    setSelectedHqsForCommission([]);
    setTempHqCommission('');
  };

  // 특정 본부 단일 삭제
  const handleRemoveHqCommission = (id: string) => {
    const filtered = (productForm.hqCommissions || []).filter(h => h.id !== id);
    setProductForm({
      ...productForm,
      hqCommissions: filtered
    });
  };

  // 특정 금액 그룹 전체 삭제
  const handleRemoveHqGroup = (commission: number) => {
    const filtered = (productForm.hqCommissions || []).filter(h => h.commission !== commission);
    setProductForm({
      ...productForm,
      hqCommissions: filtered
    });
  };

  // 제품 저장
  const handleSaveProduct = () => {
    const prodKeyword = (productForm.productKeyword || productForm.productName || '').trim();
    if (!prodKeyword) {
      alert('정확한 제품명을 선택하거나 매칭 키워드를 입력해주세요.');
      return;
    }
    if (!activeSupplier) return;

    // 만약 '전체본부' 항목이 있으면 supplyCommission에도 동기화
    const allHqRule = (productForm.hqCommissions || []).find(h => h.hqName === '전체본부' || h.hqName === '전체');
    const defaultComm = allHqRule ? allHqRule.commission : 0;

    const newProd: SupplierProductSetting = {
      id: editingProductIdx !== null && activeSupplier.products[editingProductIdx] 
        ? activeSupplier.products[editingProductIdx].id 
        : `prod-${Date.now()}`,
      productKeyword: prodKeyword,
      productName: productForm.productName?.trim() || prodKeyword,
      supplyPrice: Number(productForm.supplyPrice) || 0,
      supplyCommission: defaultComm,
      hqCommissions: productForm.hqCommissions || [],
      commissionRecipient: productForm.commissionRecipient || activeSupplier.name,
      recipientBank: productForm.recipientBank || activeSupplier.bankName,
      recipientAccount: productForm.recipientAccount || activeSupplier.accountNumber,
      recipientHolder: productForm.recipientHolder || activeSupplier.accountHolder,
      memo: productForm.memo || ''
    };

    let updatedProducts = [...(activeSupplier.products || [])];
    if (editingProductIdx !== null) {
      updatedProducts[editingProductIdx] = newProd;
    } else {
      updatedProducts.push(newProd);
    }

    const updatedSuppliers = suppliers.map(s => {
      if (s.id === activeSupplier.id) {
        return { ...s, products: updatedProducts };
      }
      return s;
    });

    setSuppliers(updatedSuppliers);
    saveSuppliersToStorage(updatedSuppliers);
    onSuppliersUpdated?.(updatedSuppliers);
    setIsProductModalOpen(false);
    setEditingProductIdx(null);
  };

  // 제품 삭제
  const handleDeleteProduct = (prodIdx: number, prodName: string) => {
    if (!window.confirm(`'${prodName}' 취급 제품 설정을 삭제하시겠습니까?`)) return;
    if (!activeSupplier) return;

    const updatedProducts = activeSupplier.products.filter((_, idx) => idx !== prodIdx);
    const updatedSuppliers = suppliers.map(s => {
      if (s.id === activeSupplier.id) {
        return { ...s, products: updatedProducts };
      }
      return s;
    });

    setSuppliers(updatedSuppliers);
    saveSuppliersToStorage(updatedSuppliers);
    onSuppliersUpdated?.(updatedSuppliers);
  };

  // 검색 필터링된 공급사
  const filteredSuppliers = suppliers.filter(s => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return s.name.toLowerCase().includes(term) ||
      (s.managerName && s.managerName.toLowerCase().includes(term)) ||
      (s.products && s.products.some(p => p.productName.toLowerCase().includes(term) || p.productKeyword.toLowerCase().includes(term)));
  });

  // 검색 필터링된 제품 선택 옵션 목록
  const filteredProductOptions = useMemo(() => {
    if (!productSearchTerm.trim()) return availableProducts;
    const term = productSearchTerm.trim().toLowerCase();
    return availableProducts.filter(p => p.toLowerCase().includes(term));
  }, [availableProducts, productSearchTerm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="bg-white rounded-2xl shadow-2xl w-[98vw] max-w-[1700px] h-[95vh] max-h-[95vh] flex flex-col overflow-hidden border border-slate-200"
      >
        {/* 모달 상단 헤더 */}
        <div className="px-6 py-3.5 bg-linear-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between shrink-0 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-300 shrink-0">
              <Building size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-black tracking-tight whitespace-nowrap">
                  공급사 관리 & 취급제품 설정
                </h2>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 whitespace-nowrap">
                  총 {suppliers.length}개 공급사
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-400/30 whitespace-nowrap">
                  구글시트 '공급사관리' 탭 연동
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 whitespace-nowrap">
                정확한 제품명을 선택하여 공급가를 지정하고, 특수수당 형태의 공급 수수료는 지정한 본부에만 맞춤 지급합니다.
              </p>
            </div>
          </div>

          {/* 헤더 우측 컨트롤 버튼 */}
          <div className="flex items-center gap-2 whitespace-nowrap">
            {/* 구글 시트 불러오기 */}
            <button
              onClick={handleLoadFromGoogleSheet}
              disabled={isCloudSyncing}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-50 whitespace-nowrap"
              title="구글 시트 '공급사관리' 탭에서 데이터를 불러옵니다"
            >
              <DownloadCloud size={14} className={isCloudSyncing ? 'animate-bounce' : ''} />
              <span>구글 시트 불러오기</span>
            </button>

            {/* 구글 시트 저장 */}
            <button
              onClick={handleSaveToGoogleSheet}
              disabled={isCloudSyncing}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all disabled:opacity-50 whitespace-nowrap"
              title="현재 등록된 공급사 목록을 구글 시트 '공급사관리' 탭에 저장합니다"
            >
              <UploadCloud size={14} className={isCloudSyncing ? 'animate-bounce' : ''} />
              <span>구글 시트 저장</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer ml-1"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 구글 시트 동기화 상태 배너 */}
        {cloudMessage && (
          <div className="px-6 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between text-xs font-medium text-indigo-900 animate-fadeIn whitespace-nowrap">
            <div className="flex items-center gap-2">
              <Cloud size={15} className="text-indigo-600 shrink-0" />
              <span>{cloudMessage}</span>
            </div>
            <button 
              onClick={() => setCloudMessage(null)}
              className="text-indigo-400 hover:text-indigo-700 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* 본문 레이아웃 (좌: 공급사 목록, 우: 상세 정보 및 취급제품) */}
        <div className="flex-1 flex overflow-hidden min-h-0 bg-slate-50">
          {/* 좌측: 공급사 목록 패널 */}
          <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
            <div className="p-3 border-b border-slate-100 flex items-center gap-2 whitespace-nowrap">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="공급사명/제품 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <button
                onClick={() => {
                  setSupplierForm({
                    name: '',
                    businessNo: '',
                    ceoName: '',
                    managerName: '',
                    managerPhone: '',
                    managerEmail: '',
                    bankName: '',
                    accountNumber: '',
                    accountHolder: '',
                    settlementDay: 31,
                    memo: '',
                    isActive: true
                  });
                  setIsEditingSupplier(true);
                  setSelectedSupplierId('');
                }}
                className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shrink-0 flex items-center gap-1 shadow-xs cursor-pointer whitespace-nowrap"
                title="신규 공급사 등록"
              >
                <Plus size={14} />
                <span>등록</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1.5 custom-scrollbar">
              {filteredSuppliers.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                  <Building size={32} className="mx-auto text-slate-300" />
                  <p className="font-semibold text-slate-600">등록된 공급사가 없습니다.</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    상단 [+ 등록] 버튼을 눌러 추가하거나,<br/>
                    [구글 시트 불러오기]를 눌러 시트에서 불러오세요.
                  </p>
                </div>
              ) : (
                filteredSuppliers.map((s) => {
                  const isSelected = s.id === selectedSupplierId && !isEditingSupplier;
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleSelectSupplier(s)}
                      className={`p-3 rounded-xl transition-all cursor-pointer border whitespace-nowrap ${
                        isSelected 
                          ? 'bg-indigo-50/80 border-indigo-200 shadow-xs' 
                          : 'bg-white border-slate-200/70 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5 truncate">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${s.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          <span className="truncate">{s.name}</span>
                        </div>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 shrink-0 ml-1">
                          제품 {s.products?.length || 0}종
                        </span>
                      </div>
                      <div className="mt-1.5 text-xs text-slate-500 space-y-0.5">
                        {s.managerName && (
                          <div className="flex items-center gap-1 truncate">
                            <User size={11} className="text-slate-400 shrink-0" />
                            <span className="truncate">{s.managerName} {s.managerPhone && `(${s.managerPhone})`}</span>
                          </div>
                        )}
                        {s.bankName && s.accountNumber && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono truncate">
                            <CreditCard size={11} className="shrink-0" />
                            <span className="truncate">{s.bankName} {s.accountNumber}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 우측: 공급사 상세 정보 & 제품/단가/수수료 관리 */}
          <div className="flex-1 flex flex-col overflow-y-auto p-6 custom-scrollbar">
            {isEditingSupplier || (!activeSupplier && suppliers.length === 0) ? (
              /* 신규 등록 / 공급사 정보 수정 폼 */
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 whitespace-nowrap">
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Building className="text-indigo-600" size={18} />
                    {isEditingSupplier && selectedSupplierId ? '공급사 기본 정보 수정' : '신규 공급사 등록'}
                  </h3>
                  <div className="flex items-center gap-2">
                    {isEditingSupplier && (
                      <button
                        onClick={() => setIsEditingSupplier(false)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        취소
                      </button>
                    )}
                    <button
                      onClick={handleSaveSupplier}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save size={14} />
                      <span>저장</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs whitespace-nowrap">
                  <div>
                    <label className="font-bold text-slate-700 mb-1 block">공급사명 *</label>
                    <input
                      type="text"
                      placeholder="예: (주)에넥스, 쿠쿠전자(주)"
                      value={supplierForm.name || ''}
                      onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 mb-1 block">사업자등록번호</label>
                    <input
                      type="text"
                      placeholder="예: 120-81-12345"
                      value={supplierForm.businessNo || ''}
                      onChange={(e) => setSupplierForm({ ...supplierForm, businessNo: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 mb-1 block">대표자명</label>
                    <input
                      type="text"
                      placeholder="대표자 성명"
                      value={supplierForm.ceoName || ''}
                      onChange={(e) => setSupplierForm({ ...supplierForm, ceoName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 mb-1 block">담당자 성명</label>
                    <input
                      type="text"
                      placeholder="예: 홍길동 팀장"
                      value={supplierForm.managerName || ''}
                      onChange={(e) => setSupplierForm({ ...supplierForm, managerName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 mb-1 block">담당자 연락처</label>
                    <input
                      type="text"
                      placeholder="010-0000-0000"
                      value={supplierForm.managerPhone || ''}
                      onChange={(e) => setSupplierForm({ ...supplierForm, managerPhone: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 mb-1 block">담당자 이메일</label>
                    <input
                      type="email"
                      placeholder="order@supplier.com"
                      value={supplierForm.managerEmail || ''}
                      onChange={(e) => setSupplierForm({ ...supplierForm, managerEmail: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 mb-1 block">정산 거래은행</label>
                    <input
                      type="text"
                      placeholder="예: 국민은행"
                      value={supplierForm.bankName || ''}
                      onChange={(e) => setSupplierForm({ ...supplierForm, bankName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 mb-1 block">정산 계좌번호</label>
                    <input
                      type="text"
                      placeholder="계좌번호 (- 포함)"
                      value={supplierForm.accountNumber || ''}
                      onChange={(e) => setSupplierForm({ ...supplierForm, accountNumber: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 mb-1 block">예금주</label>
                    <input
                      type="text"
                      placeholder="예금주 성명/법인명"
                      value={supplierForm.accountHolder || ''}
                      onChange={(e) => setSupplierForm({ ...supplierForm, accountHolder: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 mb-1 block text-xs">비고 / 메모</label>
                  <textarea
                    rows={2}
                    placeholder="공급사 관련 특이사항이나 메모 입력..."
                    value={supplierForm.memo || ''}
                    onChange={(e) => setSupplierForm({ ...supplierForm, memo: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                  />
                </div>
              </div>
            ) : !activeSupplier ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12">
                <Building size={48} className="text-slate-300 mb-3" />
                <p className="text-base font-bold text-slate-600">선택된 공급사가 없습니다.</p>
                <p className="text-xs text-slate-400 mt-1">좌측 목록에서 공급사를 선택하거나 신규 등록해주세요.</p>
              </div>
            ) : (
              /* 공급사 상세 정보 카드 & 취급 제품 리스트 */
              <div className="space-y-5">
                {/* 상단: 공급사 기본 정보 헤더 카드 */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-6 whitespace-nowrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-xl font-black text-slate-900 truncate">{activeSupplier.name}</h3>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                        거래중
                      </span>
                      {activeSupplier.businessNo && (
                        <span className="text-xs text-slate-400 font-mono shrink-0">
                          사업자: {activeSupplier.businessNo}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-x-5 gap-y-1 mt-2 text-xs text-slate-600">
                      {activeSupplier.managerName && (
                        <span>담당자: <strong className="text-slate-800">{activeSupplier.managerName}</strong> ({activeSupplier.managerPhone || '-'})</span>
                      )}
                      {activeSupplier.bankName && (
                        <span>정산계좌: <strong className="font-mono text-slate-800">{activeSupplier.bankName} {activeSupplier.accountNumber}</strong> ({activeSupplier.accountHolder})</span>
                      )}
                      <span>정산일: <strong>매월 {activeSupplier.settlementDay || 31}일</strong></span>
                    </div>
                    {activeSupplier.memo && (
                      <p className="text-xs text-slate-400 mt-1.5 italic truncate">메모: {activeSupplier.memo}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setSupplierForm({ ...activeSupplier });
                        setIsEditingSupplier(true);
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <Edit3 size={13} />
                      <span>정보 수정</span>
                    </button>
                    <button
                      onClick={() => handleDeleteSupplier(activeSupplier.id, activeSupplier.name)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <Trash2 size={13} />
                      <span>공급사 삭제</span>
                    </button>
                  </div>
                </div>

                {/* 하단: 취급 제품 및 단가/공급수수료(특수수당) 설정 섹션 */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 whitespace-nowrap">
                    <div>
                      <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                        <Package className="text-indigo-600" size={16} />
                        취급 제품 및 공급단가 / 특수수당(선택 본부 수수료) 설정
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 whitespace-nowrap">
                        * 정확한 제품명을 선택하여 공급가를 지정하고, 특수수당(공급 수수료)은 지정한 본부에만 지급됩니다. (금액: VAT 포함)
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setProductForm({
                          productKeyword: '',
                          productName: '',
                          supplyPrice: 0,
                          supplyCommission: 0,
                          hqCommissions: [],
                          commissionRecipient: activeSupplier.name,
                          recipientBank: activeSupplier.bankName,
                          recipientAccount: activeSupplier.accountNumber,
                          recipientHolder: activeSupplier.accountHolder,
                          memo: ''
                        });
                        setEditingProductIdx(null);
                        setSelectedHqsForCommission([]);
                        setTempHqCommission('');
                        setCustomHqInput('');
                        setIsDirectInputMode(false);
                        setIsProductModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <Plus size={14} />
                      <span>제품 추가</span>
                    </button>
                  </div>

                  {/* 취급 제품 목록 테이블 */}
                  <div className="overflow-x-auto border border-slate-100 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold whitespace-nowrap">
                          <th className="p-3">매칭 제품명 (키워드)</th>
                          <th className="p-3">공식 표시 제품명</th>
                          <th className="p-3 text-right">공급 단가 (VAT포함)</th>
                          <th className="p-3">수수료 지급 대상 본부 및 수수료</th>
                          <th className="p-3">수수료 수령처/계좌</th>
                          <th className="p-3 text-center w-24">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(!activeSupplier.products || activeSupplier.products.length === 0) ? (
                          <tr>
                            <td colSpan={6} className="py-10 text-center text-slate-400 whitespace-nowrap">
                              등록된 취급 제품이 없습니다. 우측 상단 [+ 제품 추가] 버튼을 눌러 정확한 제품명을 선택하여 등록하세요.
                            </td>
                          </tr>
                        ) : (
                          activeSupplier.products.map((p, idx) => (
                            <tr key={p.id || idx} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                              <td className="p-3 font-mono font-bold text-indigo-700">
                                <span className="bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100 text-xs">
                                  {p.productKeyword}
                                </span>
                              </td>
                              <td className="p-3 font-bold text-slate-800">
                                {p.productName}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-900 text-sm">
                                {(p.supplyPrice || 0).toLocaleString()}원
                              </td>
                              <td className="p-3">
                                {p.hqCommissions && p.hqCommissions.length > 0 ? (
                                  <div className="flex flex-col gap-1">
                                    {(() => {
                                      const groupMap = new Map<number, string[]>();
                                      p.hqCommissions.forEach(h => {
                                        const arr = groupMap.get(h.commission) || [];
                                        arr.push(h.hqName);
                                        groupMap.set(h.commission, arr);
                                      });
                                      return Array.from(groupMap.entries())
                                        .sort(([a], [b]) => b - a)
                                        .map(([comm, hqs]) => (
                                          <div
                                            key={comm}
                                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200 text-[11px] font-medium w-fit"
                                          >
                                            <Tag size={10} className="text-purple-500 shrink-0" />
                                            <span className="font-bold text-slate-800 max-w-[220px] truncate" title={hqs.join(', ')}>
                                              {hqs.length > 3 ? `${hqs.slice(0, 3).join(', ')} 외 ${hqs.length - 3}곳` : hqs.join(', ')}:
                                            </span>
                                            <span className="font-mono font-black text-purple-700 shrink-0">
                                              {comm.toLocaleString()}원
                                            </span>
                                          </div>
                                        ));
                                    })()}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[11px]">수수료 미지급 (대상 본부 없음)</span>
                                )}
                              </td>
                              <td className="p-3 text-slate-600 text-[11px]">
                                {p.commissionRecipient || activeSupplier.name}
                                {p.recipientBank && (
                                  <span className="text-slate-400 block font-mono text-[10px]">
                                    {p.recipientBank} {p.recipientAccount} ({p.recipientHolder})
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setProductForm({ 
                                        ...p,
                                        hqCommissions: p.hqCommissions || [] 
                                      });
                                      setEditingProductIdx(idx);
                                      setSelectedHqsForCommission([]);
                                      setTempHqCommission('');
                                      setCustomHqInput('');
                                      setIsDirectInputMode(false);
                                      setIsProductModalOpen(true);
                                    }}
                                    className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100 cursor-pointer"
                                    title="수정"
                                  >
                                    <Edit3 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteProduct(idx, p.productName)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 cursor-pointer"
                                    title="삭제"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 제품 추가/수정 모달: 정확한 제품명 선택기 + 내가 선택한 곳만 주는 수수료 구조 */}
        <AnimatePresence>
          {isProductModalOpen && (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto custom-scrollbar"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 whitespace-nowrap">
                  <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Package className="text-indigo-600" size={18} />
                    {editingProductIdx !== null ? '취급 제품 및 공급가/수수료 수정' : '신규 취급 제품 등록'}
                  </h4>
                  <button
                    onClick={() => setIsProductModalOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  {/* [1] 정확한 제품명 선택 영역 */}
                  <div className="space-y-1.5" ref={productPickerRef}>
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-slate-800 flex items-center gap-1.5">
                        <Sparkles size={14} className="text-indigo-600" />
                        <span>정확한 제품명 선택 *</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsDirectInputMode(!isDirectInputMode)}
                        className="text-[11px] text-indigo-600 hover:underline font-bold cursor-pointer"
                      >
                        {isDirectInputMode ? '목록에서 제품 선택하기' : '직접 텍스트로 입력하기'}
                      </button>
                    </div>

                    {!isDirectInputMode ? (
                      /* 실제 데이터 기반 제품명 선택 콤보박스 */
                      <div className="relative">
                        <div
                          onClick={() => setIsProductPickerOpen(!isProductPickerOpen)}
                          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 hover:border-indigo-400 rounded-xl cursor-pointer flex items-center justify-between transition-all"
                        >
                          <span className={productForm.productKeyword ? "font-bold text-slate-900" : "text-slate-400"}>
                            {productForm.productKeyword || "등록할 제품명을 선택하세요..."}
                          </span>
                          <ChevronDown size={15} className="text-slate-400" />
                        </div>

                        {/* 드롭다운 검색 팝업 */}
                        {isProductPickerOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 p-2.5 space-y-2 max-h-72 flex flex-col animate-fadeIn">
                            <div className="relative shrink-0">
                              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                placeholder="제품명 검색..."
                                value={productSearchTerm}
                                onChange={(e) => setProductSearchTerm(e.target.value)}
                                autoFocus
                                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>

                            <div className="overflow-y-auto flex-1 space-y-1 custom-scrollbar">
                              {filteredProductOptions.length === 0 ? (
                                <div className="p-4 text-center text-xs text-slate-400">
                                  검색된 제품이 없습니다.
                                </div>
                              ) : (
                                filteredProductOptions.map((prodName) => {
                                  const isSelected = productForm.productKeyword === prodName;
                                  return (
                                    <div
                                      key={prodName}
                                      onClick={() => handleSelectProductFromList(prodName)}
                                      className={`px-3 py-2 rounded-lg cursor-pointer flex items-center justify-between text-xs transition-colors ${
                                        isSelected 
                                          ? 'bg-indigo-50 text-indigo-700 font-bold' 
                                          : 'hover:bg-slate-50 text-slate-800'
                                      }`}
                                    >
                                      <span className="truncate">{prodName}</span>
                                      {isSelected && <Check size={14} className="text-indigo-600 shrink-0" />}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                        <p className="text-[11px] text-slate-400 mt-1">
                          * 발주 계약 데이터의 제품 목록에서 정확한 제품명을 선택하면 오타 없이 자동으로 매핑됩니다.
                        </p>
                      </div>
                    ) : (
                      /* 직접 텍스트 입력 모드 */
                      <div>
                        <input
                          type="text"
                          placeholder="매칭 키워드 또는 제품명 직접 입력..."
                          value={productForm.productKeyword || ''}
                          onChange={(e) => setProductForm({ ...productForm, productKeyword: e.target.value, productName: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* 공식 제품명 (표시용) */}
                  <div>
                    <label className="font-bold text-slate-700 mb-1 block">공식 제품명 (표시용)</label>
                    <input
                      type="text"
                      placeholder="화면에 표시될 공식 제품명"
                      value={productForm.productName || ''}
                      onChange={(e) => setProductForm({ ...productForm, productName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                  </div>

                  {/* 공급 단가 (원가) 입력 */}
                  <div>
                    <label className="font-bold text-slate-800 mb-1 block text-sm">
                      공급 단가 (원가, VAT포함) *
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="0"
                        value={productForm.supplyPrice || ''}
                        onChange={(e) => setProductForm({ ...productForm, supplyPrice: Number(e.target.value) })}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-black font-mono text-base text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none text-right pr-9"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">원</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      * 이 제품 1개당 공급사에 물품 대금으로 정산 지급할 부가세(VAT) 포함 단가입니다.
                    </p>
                  </div>

                  {/* [2] 공급 수수료(특수수당): 내가 선택한 곳만 주는 구조 (다중 선택 및 금액별 설정) */}
                  <div className="p-4 bg-purple-50/60 rounded-xl border border-purple-200 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-purple-900 flex items-center gap-1.5 text-xs">
                        <Tag size={14} className="text-purple-600" />
                        <span>공급 수수료 (특수수당) - 지급 대상 본부 설정</span>
                      </label>
                      <span className="text-[11px] text-purple-700 font-medium">
                        * 선택/등록한 본부에만 수수료 지급 (미지정 본부는 0원)
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      원하는 본부들을 <strong>복수 선택(여러 개 클릭)</strong>한 후 수수료 금액을 입력하면 한 번에 적용됩니다.<br />
                      (예: A, B, C 본부는 5,000원 적용 후, E, F 본부는 10,000원 추가 적용 가능)
                    </p>

                    {/* 본부 다중 선택 영역 */}
                    <div className="p-3 bg-white rounded-xl border border-purple-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span>지급 대상 본부 선택</span>
                          <span className="text-[11px] font-mono text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                            {selectedHqsForCommission.length}개 선택됨
                          </span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleSelectAllHqs}
                            className="px-2 py-0.5 text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md transition-colors cursor-pointer"
                          >
                            전체 선택
                          </button>
                          <button
                            type="button"
                            onClick={handleDeselectAllHqs}
                            className="px-2 py-0.5 text-[11px] font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            선택 해제
                          </button>
                        </div>
                      </div>

                      {/* 본부 칩 목록 (클릭하여 토글) */}
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto custom-scrollbar p-1">
                        {/* 전체본부 공통 칩 */}
                        <button
                          type="button"
                          onClick={() => handleToggleHqSelection('전체본부')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                            selectedHqsForCommission.includes('전체본부')
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100'
                          }`}
                        >
                          <Check size={12} className={selectedHqsForCommission.includes('전체본부') ? 'opacity-100' : 'opacity-0'} />
                          <span>★ 전체본부 (공통지급)</span>
                        </button>

                        {/* 개별 본부 칩들 */}
                        {allHqCandidates.map((hq) => {
                          const isSelected = selectedHqsForCommission.includes(hq);
                          const existingRule = (productForm.hqCommissions || []).find(h => h.hqName === hq);

                          return (
                            <button
                              key={hq}
                              type="button"
                              onClick={() => handleToggleHqSelection(hq)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                                isSelected
                                  ? 'bg-purple-600 text-white font-bold shadow-xs'
                                  : existingRule
                                  ? 'bg-purple-50/50 text-slate-800 border border-purple-200 hover:border-purple-300 font-semibold'
                                  : 'bg-white text-slate-700 border border-slate-200 hover:border-purple-300 hover:bg-purple-50 font-medium'
                              }`}
                            >
                              <Check size={12} className={isSelected ? 'opacity-100' : 'opacity-0'} />
                              <span>{hq}</span>
                              {existingRule && (
                                <span className={`text-[10px] ml-0.5 font-mono ${isSelected ? 'text-purple-200' : 'text-purple-600'}`}>
                                  ({existingRule.commission.toLocaleString()}원)
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* 목록에 없는 본부 직접 입력창 */}
                      <div className="flex items-center gap-2 pt-1.5 border-t border-slate-100">
                        <input
                          type="text"
                          placeholder="목록에 없는 본부명 직접 입력 (예: 비전, 포커스)..."
                          value={customHqInput}
                          onChange={(e) => setCustomHqInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustomHq())}
                          className="flex-1 px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-1 focus:ring-purple-400 outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomHq}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                        >
                          + 본부 추가
                        </button>
                      </div>
                    </div>

                    {/* 수수료 금액 입력 및 일괄 적용 바 */}
                    <div className="flex items-center gap-2 bg-purple-100/60 p-2.5 rounded-xl border border-purple-200">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          placeholder="수수료 금액 입력 (VAT포함)"
                          value={tempHqCommission}
                          onChange={(e) => setTempHqCommission(e.target.value === '' ? '' : Number(e.target.value))}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleApplyMultiHqCommission())}
                          className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl text-xs font-mono font-black text-purple-900 focus:ring-2 focus:ring-purple-400 outline-none text-right pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-500 font-bold text-xs">원</span>
                      </div>

                      <button
                        type="button"
                        onClick={handleApplyMultiHqCommission}
                        disabled={selectedHqsForCommission.length === 0}
                        className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 cursor-pointer flex items-center gap-1.5 shadow-xs whitespace-nowrap transition-all ${
                          selectedHqsForCommission.length > 0
                            ? 'bg-purple-600 hover:bg-purple-700 text-white'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <Plus size={14} />
                        <span>선택한 {selectedHqsForCommission.length}개 본부에 적용</span>
                      </button>
                    </div>

                    {/* 등록된 수수료 지급 대상 본부 리스트 (금액별 그룹화 표시) */}
                    {groupedHqCommissions.length > 0 ? (
                      <div className="space-y-2 pt-1">
                        <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                          <span>등록된 지급 대상 본부 및 수수료 현황:</span>
                          <span className="text-purple-600 font-mono">총 {productForm.hqCommissions?.length || 0}개 본부 설정됨</span>
                        </div>

                        {groupedHqCommissions.map(({ commission, items }) => (
                          <div
                            key={commission}
                            className="bg-white rounded-xl border border-purple-200 p-2.5 shadow-2xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between pb-1.5 border-b border-purple-100">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-purple-600" />
                                <span className="text-purple-700 font-mono font-black text-sm">
                                  {commission.toLocaleString()}원
                                </span>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  (VAT포함 · {items.length}개 본부 적용)
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveHqGroup(commission)}
                                className="text-[11px] text-rose-500 hover:text-rose-700 font-medium hover:underline cursor-pointer"
                                title="이 금액의 모든 본부 설정 삭제"
                              >
                                그룹 전체 삭제
                              </button>
                            </div>

                            {/* 소속 본부 칩들 (개별 삭제 가능) */}
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {items.map((hq) => (
                                <span
                                  key={hq.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-900 border border-purple-200 text-xs font-semibold"
                                >
                                  <span>{hq.hqName}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveHqCommission(hq.id)}
                                    className="text-purple-400 hover:text-rose-600 rounded-full p-0.5 cursor-pointer transition-colors"
                                    title={`${hq.hqName} 본부 수수료 제외`}
                                  >
                                    <X size={12} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-purple-700 bg-purple-100/40 p-2.5 rounded-lg text-center font-medium">
                        현재 등록된 지급 대상 본부가 없습니다. (이 제품은 수수료가 발생하지 않습니다)
                      </div>
                    )}
                  </div>

                  {/* 수수료 수령자 / 계좌정보 */}
                  <div className="pt-2 border-t border-slate-100">
                    <label className="font-bold text-slate-700 mb-1 block">
                      수수료 수령처 / 계좌정보 (선택사항, 미입력 시 공급사 기본계좌로 지급)
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="수령자 성명/처"
                        value={productForm.commissionRecipient || ''}
                        onChange={(e) => setProductForm({ ...productForm, commissionRecipient: e.target.value })}
                        className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white outline-none"
                      />
                      <input
                        type="text"
                        placeholder="은행명"
                        value={productForm.recipientBank || ''}
                        onChange={(e) => setProductForm({ ...productForm, recipientBank: e.target.value })}
                        className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white outline-none"
                      />
                      <input
                        type="text"
                        placeholder="계좌번호"
                        value={productForm.recipientAccount || ''}
                        onChange={(e) => setProductForm({ ...productForm, recipientAccount: e.target.value })}
                        className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 whitespace-nowrap">
                  <button
                    onClick={() => setIsProductModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveProduct}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Check size={14} />
                    <span>확인 및 저장</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
