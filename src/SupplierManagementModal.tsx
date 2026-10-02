import React, { useState, useEffect } from 'react';
import { 
  X, Building, Plus, Trash2, Edit3, Save, Check, RefreshCw, 
  Package, CreditCard, DollarSign, Search, Phone, User, Calendar, 
  FileText, CheckCircle2, ChevronRight, Cloud, DownloadCloud, UploadCloud, 
  AlertCircle, Layers, Tag, HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface HqCommissionSetting {
  id: string;
  hqName: string;       // 본부명 (예: 맥스, 무한, 스타, 에이스 등)
  commission: number;   // 해당 본부에 적용할 차등 수수료 (VAT 포함)
  memo?: string;
}

export interface SupplierProductSetting {
  id: string;
  productKeyword: string; // 매칭 키워드 (렌탈상품명 등에 포함된 단어)
  productName: string;    // 공식 표시 제품명
  supplyPrice: number;    // 공급 단가 (VAT 포함)
  supplyCommission: number; // 기본 공급 수수료 단가 (VAT 포함, 특수수당 성격)
  hqCommissions?: HqCommissionSetting[]; // 본부별 차등 수수료 설정
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

// 로컬 스토리지 키 (샘플 제거 및 클린 상태 보장을 위해 v3 사용)
export const SUPPLIER_STORAGE_KEY = 'erp_suppliers_master_v3';

// 초기값은 비워둠 (사용자가 직접 등록하거나 구글 시트에서 동기화)
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
}

export const SupplierManagementModal: React.FC<SupplierManagementModalProps> = ({
  isOpen,
  onClose,
  onSuppliersUpdated
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

  // 본부별 차등 수수료 입력 임시 필드
  const [tempHqName, setTempHqName] = useState('');
  const [tempHqCommission, setTempHqCommission] = useState<number | ''>('');

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

  // 공급사 저장 (신규 또는 수정)
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

  // 본부별 차등 수수료 추가 핸들러
  const handleAddHqCommission = () => {
    if (!tempHqName.trim()) {
      alert('본부명을 입력해주세요. (예: 맥스, 무한, 스타, 에이스)');
      return;
    }
    const commVal = Number(tempHqCommission);
    if (isNaN(commVal) || commVal < 0) {
      alert('올바른 수수료 금액(원, VAT포함)을 입력해주세요.');
      return;
    }

    const currentList = productForm.hqCommissions || [];
    // 이미 존재하는 본부명인지 확인
    if (currentList.some(h => h.hqName.trim().toLowerCase() === tempHqName.trim().toLowerCase())) {
      alert('이미 설정된 본부입니다. 기존 항목을 삭제 후 다시 추가해주세요.');
      return;
    }

    const newHqItem: HqCommissionSetting = {
      id: `hq-${Date.now()}`,
      hqName: tempHqName.trim(),
      commission: commVal
    };

    setProductForm({
      ...productForm,
      hqCommissions: [...currentList, newHqItem]
    });
    setTempHqName('');
    setTempHqCommission('');
  };

  // 본부별 차등 수수료 삭제 핸들러
  const handleRemoveHqCommission = (id: string) => {
    const filtered = (productForm.hqCommissions || []).filter(h => h.id !== id);
    setProductForm({
      ...productForm,
      hqCommissions: filtered
    });
  };

  // 제품 저장
  const handleSaveProduct = () => {
    if (!productForm.productKeyword?.trim()) {
      alert('매칭 키워드(렌탈상품명에 포함될 키워드)를 입력해주세요.');
      return;
    }
    if (!activeSupplier) return;

    const newProd: SupplierProductSetting = {
      id: editingProductIdx !== null && activeSupplier.products[editingProductIdx] 
        ? activeSupplier.products[editingProductIdx].id 
        : `prod-${Date.now()}`,
      productKeyword: productForm.productKeyword.trim(),
      productName: productForm.productName?.trim() || productForm.productKeyword.trim(),
      supplyPrice: Number(productForm.supplyPrice) || 0,
      supplyCommission: Number(productForm.supplyCommission) || 0,
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
                발주 공급사 정보와 제품별 공급단가(VAT포함), 본부별 차등 특수수당(공급 수수료)을 원스톱으로 관리합니다.
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
                        취급 제품 및 공급단가 / 특수수당(공급 수수료) 설정
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 whitespace-nowrap">
                        * 렌탈상품명에 매칭 키워드가 포함되면 자동 매핑되며, 본부별 차등 수수료가 있을 경우 본부에 맞게 우선 적용됩니다. (금액: VAT 포함)
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
                        setTempHqName('');
                        setTempHqCommission('');
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
                          <th className="p-3">매칭 키워드</th>
                          <th className="p-3">공식 제품명</th>
                          <th className="p-3 text-right">공급 단가 (VAT포함)</th>
                          <th className="p-3 text-right">기본 공급 수수료</th>
                          <th className="p-3">본부별 차등 수수료 (특수수당)</th>
                          <th className="p-3">수수료 수령처/계좌</th>
                          <th className="p-3 text-center w-24">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(!activeSupplier.products || activeSupplier.products.length === 0) ? (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-slate-400 whitespace-nowrap">
                              등록된 취급 제품이 없습니다. 우측 상단 [+ 제품 추가] 버튼을 눌러 등록하세요.
                            </td>
                          </tr>
                        ) : (
                          activeSupplier.products.map((p, idx) => (
                            <tr key={p.id || idx} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                              <td className="p-3 font-mono font-bold text-indigo-700">
                                <span className="bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                  {p.productKeyword}
                                </span>
                              </td>
                              <td className="p-3 font-bold text-slate-800">
                                {p.productName}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-900">
                                {(p.supplyPrice || 0).toLocaleString()}원
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-purple-700">
                                {(p.supplyCommission || 0).toLocaleString()}원
                              </td>
                              <td className="p-3">
                                {p.hqCommissions && p.hqCommissions.length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {p.hqCommissions.map((hq) => (
                                      <span
                                        key={hq.id}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-semibold"
                                      >
                                        <Tag size={10} className="text-purple-500" />
                                        <span>{hq.hqName}:</span>
                                        <strong className="font-mono">{hq.commission.toLocaleString()}원</strong>
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[11px]">전 본부 기본 수수료 적용</span>
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
                                      setTempHqName('');
                                      setTempHqCommission('');
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

        {/* 제품 추가/수정 서브 모달 (와이드 레이아웃 & 본부별 차등 수수료 설정 탑재) */}
        <AnimatePresence>
          {isProductModalOpen && (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 whitespace-nowrap">
                  <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Package className="text-indigo-600" size={18} />
                    {editingProductIdx !== null ? '취급 제품 및 단가/수수료 수정' : '신규 취급 제품 등록'}
                  </h4>
                  <button
                    onClick={() => setIsProductModalOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 mb-1 block">
                      매칭 키워드 * (발주 데이터 렌탈상품명과 매칭할 단어)
                    </label>
                    <input
                      type="text"
                      placeholder="예: 뉴스카이타워, 쿠쿠, G210NW, 가스트로플러스"
                      value={productForm.productKeyword || ''}
                      onChange={(e) => setProductForm({ ...productForm, productKeyword: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      * 렌탈상품명에 이 단어가 포함되면 해당 공급사로 자동 분류되어 정산됩니다.
                    </p>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 mb-1 block">공식 제품명 (표시용)</label>
                    <input
                      type="text"
                      placeholder="예: 뉴스카이타워G9 3in1 프리미엄"
                      value={productForm.productName || ''}
                      onChange={(e) => setProductForm({ ...productForm, productName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="font-bold text-slate-700 mb-1 block">
                        공급 단가 (원가, VAT포함) *
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="0"
                          value={productForm.supplyPrice || ''}
                          onChange={(e) => setProductForm({ ...productForm, supplyPrice: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none text-right pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">원</span>
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-purple-700 mb-1 block">
                        기본 공급 수수료 (특수수당, VAT포함) *
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="0"
                          value={productForm.supplyCommission || ''}
                          onChange={(e) => setProductForm({ ...productForm, supplyCommission: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-purple-50/50 border border-purple-200 rounded-xl font-bold font-mono text-purple-700 focus:bg-white focus:ring-2 focus:ring-purple-200 outline-none text-right pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-500 font-bold">원</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        * 본부별 차등 수수료가 지정되지 않은 본부에 공통 적용되는 기본 수수료입니다.
                      </p>
                    </div>
                  </div>

                  {/* 본부별 차등 공급 수수료 (특수수당) 설정 섹션 */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-slate-800 flex items-center gap-1.5">
                        <Tag size={13} className="text-purple-600" />
                        <span>본부별 차등 공급 수수료 (특수수당) 설정</span>
                      </label>
                      <span className="text-[11px] text-slate-500">
                        * 특정 본부에만 다른 수수료가 적용될 경우 등록
                      </span>
                    </div>

                    {/* 신규 차등 입력 바 */}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="본부명 (예: 맥스, 무한)"
                        value={tempHqName}
                        onChange={(e) => setTempHqName(e.target.value)}
                        className="w-40 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-purple-500 outline-none"
                      />
                      <div className="relative flex-1">
                        <input
                          type="number"
                          placeholder="해당 본부 수수료 (VAT포함)"
                          value={tempHqCommission}
                          onChange={(e) => setTempHqCommission(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-purple-700 focus:ring-1 focus:ring-purple-500 outline-none text-right pr-7"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">원</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddHqCommission}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer flex items-center gap-1 whitespace-nowrap"
                      >
                        <Plus size={13} />
                        <span>차등 추가</span>
                      </button>
                    </div>

                    {/* 등록된 차등 수수료 리스트 */}
                    {productForm.hqCommissions && productForm.hqCommissions.length > 0 ? (
                      <div className="space-y-1.5 pt-1">
                        {productForm.hqCommissions.map((hq) => (
                          <div
                            key={hq.id}
                            className="flex items-center justify-between px-3 py-1.5 bg-white rounded-lg border border-purple-200 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800">{hq.hqName}본부</span>
                              <span className="text-purple-600 font-mono font-bold">
                                {hq.commission.toLocaleString()}원
                              </span>
                              <span className="text-[10px] text-slate-400">
                                (기본 대비 {(hq.commission - (productForm.supplyCommission || 0)) >= 0 ? '+' : ''}
                                {(hq.commission - (productForm.supplyCommission || 0)).toLocaleString()}원)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveHqCommission(hq.id)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded cursor-pointer"
                              title="삭제"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 text-center py-1">
                        설정된 본부별 차등 수수료가 없습니다. (모든 본부에 기본 수수료 적용)
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <label className="font-bold text-slate-700 mb-1 block">
                      수수료 수령자 / 계좌정보 (미입력 시 공급사 기본계좌로 지급)
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
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveProduct}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
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
