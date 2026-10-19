import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, Building, Plus, Trash2, Edit3, Save, Check, RefreshCw, 
  Package, CreditCard, DollarSign, Search, Phone, User, Calendar, 
  FileText, CheckCircle2, ChevronRight, Cloud, DownloadCloud, UploadCloud, 
  AlertCircle, Layers, Tag, HelpCircle, ChevronDown, CheckSquare, Sparkles,
  Copy, Square, ArrowRight, ShieldCheck
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
  enexPrice?: number;     // 에넥스 입금가 (건당 수납액, VAT 포함)
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

// 로컬 스토리지 키 및 백업 키
export const SUPPLIER_STORAGE_KEY = 'erp_suppliers_master_v3';
export const SUPPLIER_BACKUP_KEY = 'erp_suppliers_master_v3_backup';
export const SUPPLIER_SNAPSHOTS_KEY = 'erp_suppliers_snapshots_history';

// 초기값
export const INITIAL_SUPPLIERS: SupplierItem[] = [];

// 안전 스냅샷 생성 (최대 10개 버전 누적 보관)
export const createSupplierSnapshot = (suppliers: SupplierItem[], reason: string = 'auto') => {
  if (!Array.isArray(suppliers) || suppliers.length === 0) return;
  try {
    const raw = localStorage.getItem(SUPPLIER_SNAPSHOTS_KEY);
    const history: Array<{ timestamp: string; reason: string; count: number; data: SupplierItem[] }> = raw ? JSON.parse(raw) : [];
    history.unshift({
      timestamp: new Date().toISOString(),
      reason,
      count: suppliers.length,
      data: suppliers
    });
    localStorage.setItem(SUPPLIER_SNAPSHOTS_KEY, JSON.stringify(history.slice(0, 10)));
  } catch (e) {
    console.warn('[Supplier Snapshot Error]:', e);
  }
};

// 백그라운드 구글 시트 자동 저장 (사용자 UI 방해 없이 조용히 동기화)
export const syncSuppliersToSheetSilent = async (suppliers: SupplierItem[]): Promise<boolean> => {
  if (!Array.isArray(suppliers) || suppliers.length === 0) return false;
  try {
    const res = await fetch('/api/sheets/suppliers/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suppliers })
    });
    return res.ok;
  } catch (e) {
    console.warn('[Supplier Silent Sync Error]:', e);
    return false;
  }
};

// 로컬 스토리지에서 공급사 로드 (3중 복구 장치: 마스터 -> 백업 -> 스냅샷)
export const loadSuppliersFromStorage = (): SupplierItem[] => {
  try {
    // 1) 1차 마스터 키 확인
    const saved = localStorage.getItem(SUPPLIER_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }

    // 2) 2차 백업 키에서 복구 시도
    const backup = localStorage.getItem(SUPPLIER_BACKUP_KEY);
    if (backup) {
      const parsedBackup = JSON.parse(backup);
      if (Array.isArray(parsedBackup) && parsedBackup.length > 0) {
        console.warn('⚠️ [공급사 복구] 마스터 저장소가 비어있어 백업 저장소에서 복원했습니다.');
        localStorage.setItem(SUPPLIER_STORAGE_KEY, backup);
        return parsedBackup;
      }
    }

    // 3) 3차 스냅샷 히스토리에서 가장 최근 유효 데이터 복구 시도
    const rawSnapshots = localStorage.getItem(SUPPLIER_SNAPSHOTS_KEY);
    if (rawSnapshots) {
      const history = JSON.parse(rawSnapshots);
      if (Array.isArray(history) && history.length > 0) {
        for (const snap of history) {
          if (Array.isArray(snap.data) && snap.data.length > 0) {
            console.warn(`⚠️ [공급사 복구] 스냅샷(${snap.timestamp})에서 ${snap.data.length}개 공급사를 안전하게 복구했습니다.`);
            localStorage.setItem(SUPPLIER_STORAGE_KEY, JSON.stringify(snap.data));
            return snap.data;
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to load suppliers:', e);
  }
  return [];
};

// 로컬 스토리지에 공급사 저장 (3중 안전 저장: 마스터 + 백업 + 스냅샷)
export const saveSuppliersToStorage = (suppliers: SupplierItem[]): void => {
  try {
    const jsonStr = JSON.stringify(suppliers);
    localStorage.setItem(SUPPLIER_STORAGE_KEY, jsonStr);

    // 비어있지 않은 유효한 데이터일 때 백업 키 및 스냅샷 누적 저장
    if (Array.isArray(suppliers) && suppliers.length > 0) {
      localStorage.setItem(SUPPLIER_BACKUP_KEY, jsonStr);
      createSupplierSnapshot(suppliers, 'save');
    }
  } catch (e) {
    console.error('Failed to save suppliers:', e);
  }
};

export interface HqAccountInfo {
  name: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  type?: 'HQ' | 'DIVISION';
}

export const DEFAULT_HQ_ACCOUNTS: HqAccountInfo[] = [
  { name: '리치웰페어', bankName: '-', accountNumber: '-', accountHolder: '-' },
  { name: '한가득플러스', bankName: '우리', accountNumber: '1005304615801', accountHolder: '(주)한가득플러스' },
  { name: '맥스', bankName: '우리', accountNumber: '1005603174407', accountHolder: '김학민(골프존파크)' },
  { name: '더라이프앤', bankName: '하나', accountNumber: '79391040692907', accountHolder: '박인천(더드림)' },
  { name: '더원시스템', bankName: '하나', accountNumber: '17291002173204', accountHolder: '주식회사 더원시스템' },
  { name: '위더스앤씨', bankName: '기업', accountNumber: '49707471104012', accountHolder: '주식회사 위더스앤씨' },
  { name: '커런시마켓', bankName: '하나', accountNumber: '77991002664704', accountHolder: '주식회사 커런시마켓' },
  { name: '드라마플라워', bankName: '-', accountNumber: '-', accountHolder: '-' },
  { name: '파파쿡', bankName: 'MG새마을금고', accountNumber: '9003293506338', accountHolder: '박진우(파파쿡)' },
  { name: '글로씨', bankName: '카카오뱅크', accountNumber: '3333133132556', accountHolder: '이동현' },
  { name: '웰다잉라이프', bankName: '기업', accountNumber: '16417285904019', accountHolder: '박서영(웰다잉라이프)' },
  { name: '뷰티가이', bankName: '기업', accountNumber: '116-132917-01-018', accountHolder: '서정일 (뷰티가이)' },
  { name: '파란하늘', bankName: '기업', accountNumber: '185-096869-02-019', accountHolder: '파란하늘(노은경)' },
  { name: '조민경', bankName: '카카오뱅크', accountNumber: '3333027476861', accountHolder: '조민경' },
  { name: '조재윤', bankName: '수협', accountNumber: '206000673009', accountHolder: '조재윤' },
  { name: '조재은', bankName: '수협', accountNumber: '206000673009', accountHolder: '조재은' },
  { name: '언바운드컴퍼니', bankName: '국민은행', accountNumber: '79400104179154', accountHolder: '주식회사 언바운드컴퍼니' }
];

interface SupplierManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuppliersUpdated?: (suppliers: SupplierItem[]) => void;
  availableProducts?: string[];
  availableHqs?: string[];
  hqSettings?: any[];
  divisionSettings?: any[];
}

export const SupplierManagementModal: React.FC<SupplierManagementModalProps> = ({
  isOpen,
  onClose,
  onSuppliersUpdated,
  availableProducts = [],
  availableHqs = [],
  hqSettings = [],
  divisionSettings = []
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

  // 수수료 설정 일괄 복사 모달 상태
  const [isBatchCopyModalOpen, setIsBatchCopyModalOpen] = useState(false);
  const [sourceProductForCopy, setSourceProductForCopy] = useState<SupplierProductSetting | null>(null);
  const [targetProductIdsForCopy, setTargetProductIdsForCopy] = useState<string[]>([]);
  const [copyOptions, setCopyOptions] = useState({
    copyCommissions: true,  // 본부별 수수료 목록 복사
    copyRecipient: true,    // 수수료 수령처 및 계좌정보 복사
    copySupplyPrice: false, // 공급 단가 복사 (선택 사항)
    copyEnexPrice: false    // 에넥스 입금가 복사 (선택 사항)
  });

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

  // 본부 및 사업단 계좌 정보 맵 (DEFAULT_HQ_ACCOUNTS + localStorage + props)
  const hqAccountMap = useMemo(() => {
    const map = new Map<string, HqAccountInfo>();

    // 1) 기본 백업 계좌 (DEFAULT_HQ_ACCOUNTS)
    DEFAULT_HQ_ACCOUNTS.forEach(acc => {
      const key = acc.name.trim().toLowerCase();
      if (key) {
        map.set(key, { ...acc });
      }
    });

    // 2) 로컬 스토리지 - 본부 설정 ('erp_hq_settings_v2')
    try {
      const savedHqs = localStorage.getItem('erp_hq_settings_v2');
      if (savedHqs) {
        const parsed = JSON.parse(savedHqs);
        if (Array.isArray(parsed)) {
          parsed.forEach((h: any) => {
            const name = (h.name || '').trim();
            if (name) {
              const key = name.toLowerCase();
              const existing = map.get(key) || { name, bankName: '', accountNumber: '', accountHolder: '' };
              map.set(key, {
                name,
                bankName: h.bankName || existing.bankName || '',
                accountNumber: h.accountNumber || existing.accountNumber || '',
                accountHolder: h.accountHolder || existing.accountHolder || '',
                type: 'HQ'
              });
            }
          });
        }
      }
    } catch (e) {
      console.warn('Failed to parse erp_hq_settings_v2:', e);
    }

    // 3) 로컬 스토리지 - 사업단 설정 ('erp_division_settings_v1')
    try {
      const savedDivs = localStorage.getItem('erp_division_settings_v1');
      if (savedDivs) {
        const parsed = JSON.parse(savedDivs);
        if (Array.isArray(parsed)) {
          parsed.forEach((d: any) => {
            const name = (d.name || '').trim();
            if (name) {
              const key = name.toLowerCase();
              const existing = map.get(key) || { name, bankName: '', accountNumber: '', accountHolder: '' };
              map.set(key, {
                name,
                bankName: d.bankName || existing.bankName || '',
                accountNumber: d.accountNumber || existing.accountNumber || '',
                accountHolder: d.accountHolder || existing.accountHolder || '',
                type: 'DIVISION'
              });
            }
          });
        }
      }
    } catch (e) {
      console.warn('Failed to parse erp_division_settings_v1:', e);
    }

    // 4) props: hqSettings
    if (Array.isArray(hqSettings)) {
      hqSettings.forEach((h: any) => {
        const name = (h.name || '').trim();
        if (name) {
          const key = name.toLowerCase();
          const existing = map.get(key) || { name, bankName: '', accountNumber: '', accountHolder: '' };
          map.set(key, {
            name,
            bankName: h.bankName || existing.bankName || '',
            accountNumber: h.accountNumber || existing.accountNumber || '',
            accountHolder: h.accountHolder || existing.accountHolder || '',
            type: 'HQ'
          });
        }
      });
    }

    // 5) props: divisionSettings
    if (Array.isArray(divisionSettings)) {
      divisionSettings.forEach((d: any) => {
        const name = (d.name || '').trim();
        if (name) {
          const key = name.toLowerCase();
          const existing = map.get(key) || { name, bankName: '', accountNumber: '', accountHolder: '' };
          map.set(key, {
            name,
            bankName: d.bankName || existing.bankName || '',
            accountNumber: d.accountNumber || existing.accountNumber || '',
            accountHolder: d.accountHolder || existing.accountHolder || '',
            type: 'DIVISION'
          });
        }
      });
    }

    // 6) availableHqs 목록
    availableHqs.forEach(h => {
      const name = (h || '').trim();
      if (name && name !== '전체' && name !== '전체본부') {
        const key = name.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            name,
            bankName: '',
            accountNumber: '',
            accountHolder: '',
            type: 'HQ'
          });
        }
      }
    });

    return map;
  }, [hqSettings, divisionSettings, availableHqs]);

  // 본부 목록 드롭다운 옵션
  const hqAccountOptions = useMemo<HqAccountInfo[]>(() => {
    const list = Array.from(hqAccountMap.values()) as HqAccountInfo[];
    return list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [hqAccountMap]);

  // 본부 선택 시 수령처 및 계좌정보 자동 채우기 핸들러
  const handleSelectHqForRecipient = (hqName: string) => {
    if (!hqName) return;
    const key = hqName.trim().toLowerCase();
    const info = hqAccountMap.get(key);
    if (info) {
      setProductForm(prev => ({
        ...prev,
        commissionRecipient: info.name,
        recipientBank: (info.bankName && info.bankName !== '-') ? info.bankName : '',
        recipientAccount: (info.accountNumber && info.accountNumber !== '-') ? info.accountNumber : '',
        recipientHolder: (info.accountHolder && info.accountHolder !== '-') ? info.accountHolder : ''
      }));
    } else {
      setProductForm(prev => ({
        ...prev,
        commissionRecipient: hqName
      }));
    }
  };

  // 공급사 기본 계좌로 채우기 핸들러
  const handleResetToSupplierAccount = () => {
    if (activeSupplier) {
      setProductForm(prev => ({
        ...prev,
        commissionRecipient: activeSupplier.name || '',
        recipientBank: activeSupplier.bankName || '',
        recipientAccount: activeSupplier.accountNumber || '',
        recipientHolder: activeSupplier.accountHolder || ''
      }));
    }
  };

  // 수령처 초기화 핸들러
  const handleClearRecipient = () => {
    setProductForm(prev => ({
      ...prev,
      commissionRecipient: '',
      recipientBank: '',
      recipientAccount: '',
      recipientHolder: ''
    }));
  };

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
      enexPrice: Number(productForm.enexPrice) || 0,
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
    syncSuppliersToSheetSilent(updatedSuppliers); // 백그라운드 구글 시트 자동 저장
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
    syncSuppliersToSheetSilent(updatedSuppliers); // 백그라운드 구글 시트 자동 저장
  };

  // 특정 제품의 수수료 설정을 기준으로 일괄 복사 모달 오픈
  const handleOpenBatchCopyModal = (prod: SupplierProductSetting) => {
    setSourceProductForCopy(prod);
    if (activeSupplier && activeSupplier.products) {
      // 기준 제품을 제외한 나머지 모든 제품을 기본 선택 대상으로 지정
      const otherProducts = activeSupplier.products.filter(p => p.id !== prod.id);
      setTargetProductIdsForCopy(otherProducts.map(p => p.id));
    } else {
      setTargetProductIdsForCopy([]);
    }
    setCopyOptions({
      copyCommissions: true,
      copyRecipient: true,
      copySupplyPrice: false,
      copyEnexPrice: false
    });
    setIsBatchCopyModalOpen(true);
  };

  // 대상 제품 선택 토글
  const handleToggleTargetProduct = (id: string) => {
    setTargetProductIdsForCopy(prev => {
      if (prev.includes(id)) {
        return prev.filter(pId => pId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // 대상 제품 전체 선택
  const handleSelectAllTargets = () => {
    if (activeSupplier && activeSupplier.products && sourceProductForCopy) {
      const others = activeSupplier.products
        .filter(p => p.id !== sourceProductForCopy.id)
        .map(p => p.id);
      setTargetProductIdsForCopy(others);
    }
  };

  // 대상 제품 전체 해제
  const handleDeselectAllTargets = () => {
    setTargetProductIdsForCopy([]);
  };

  // 일괄 적용 실행
  const handleApplyBatchCopy = async () => {
    if (!sourceProductForCopy || !activeSupplier) return;
    if (targetProductIdsForCopy.length === 0) {
      alert('설정을 복사할 대상 제품을 1개 이상 선택해주세요.');
      return;
    }

    const targetCount = targetProductIdsForCopy.length;
    const confirmMsg = `'${sourceProductForCopy.productName || sourceProductForCopy.productKeyword}'의 수수료 설정을 선택한 ${targetCount}개 제품에 일괄 적용하시겠습니까?\n\n` +
      `• 복사 내용: ` +
      (copyOptions.copyCommissions ? `[본부별 수수료 ${(sourceProductForCopy.hqCommissions || []).length}개 본부 설정] ` : '') +
      (copyOptions.copyRecipient ? `[수령처: ${sourceProductForCopy.commissionRecipient || activeSupplier.name}] ` : '') +
      (copyOptions.copySupplyPrice ? `[공급단가: ${(sourceProductForCopy.supplyPrice || 0).toLocaleString()}원] ` : '') +
      (copyOptions.copyEnexPrice ? `[에넥스입금가: ${(sourceProductForCopy.enexPrice || 0).toLocaleString()}원]` : '');

    if (!window.confirm(confirmMsg)) return;

    // 1) 안전 스냅샷 백업 생성
    createSupplierSnapshot(suppliers, `batch_copy_from_${sourceProductForCopy.productKeyword}`);

    // 2) 깊은 복사로 각 제품에 고유한 hqCommissions ID를 발급하며 안전하게 병합
    const targetSet = new Set(targetProductIdsForCopy);
    const updatedProducts = (activeSupplier.products || []).map(p => {
      if (!targetSet.has(p.id)) return p;

      const updated = { ...p };

      // 본부 수수료 복사
      if (copyOptions.copyCommissions) {
        updated.hqCommissions = (sourceProductForCopy.hqCommissions || []).map(h => ({
          ...h,
          id: `hq-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
        }));
        updated.supplyCommission = sourceProductForCopy.supplyCommission || 0;
      }

      // 수령처 및 계좌 복사
      if (copyOptions.copyRecipient) {
        updated.commissionRecipient = sourceProductForCopy.commissionRecipient || activeSupplier.name;
        updated.recipientBank = sourceProductForCopy.recipientBank || activeSupplier.bankName;
        updated.recipientAccount = sourceProductForCopy.recipientAccount || activeSupplier.accountNumber;
        updated.recipientHolder = sourceProductForCopy.recipientHolder || activeSupplier.accountHolder;
      }

      // 공급단가 복사 (선택 시)
      if (copyOptions.copySupplyPrice) {
        updated.supplyPrice = sourceProductForCopy.supplyPrice;
      }

      // 에넥스 입금가 복사 (선택 시)
      if (copyOptions.copyEnexPrice) {
        updated.enexPrice = sourceProductForCopy.enexPrice;
      }

      return updated;
    });

    const updatedSuppliers = suppliers.map(s => {
      if (s.id === activeSupplier.id) {
        return { ...s, products: updatedProducts };
      }
      return s;
    });

    // 3) 3중 로컬 스토리지 즉시 안전 저장
    setSuppliers(updatedSuppliers);
    saveSuppliersToStorage(updatedSuppliers);
    onSuppliersUpdated?.(updatedSuppliers);

    // 4) 구글 시트 백엔드 자동 동기화
    syncSuppliersToSheetSilent(updatedSuppliers);

    setIsBatchCopyModalOpen(false);
    setSourceProductForCopy(null);
    setTargetProductIdsForCopy([]);
    alert(`총 ${targetCount}개 제품에 수수료 설정이 성공적으로 일괄 적용되었습니다! (로컬 및 구글 시트 안전 저장 완료)`);
  };

  // 개별 제품 모달 내에서 다른 제품 설정 가져오기
  const handleLoadSettingsFromOtherProduct = (prodId: string) => {
    if (!prodId || !activeSupplier) return;
    const found = (activeSupplier.products || []).find(p => p.id === prodId);
    if (!found) return;

    if (!window.confirm(`'${found.productName || found.productKeyword}'의 본부별 수수료 및 수령처 정보를 현재 제품으로 불러오시겠습니까?`)) {
      return;
    }

    setProductForm(prev => ({
      ...prev,
      hqCommissions: (found.hqCommissions || []).map(h => ({
        ...h,
        id: `hq-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
      })),
      supplyCommission: found.supplyCommission || 0,
      commissionRecipient: found.commissionRecipient || activeSupplier.name,
      recipientBank: found.recipientBank || activeSupplier.bankName,
      recipientAccount: found.recipientAccount || activeSupplier.accountNumber,
      recipientHolder: found.recipientHolder || activeSupplier.accountHolder
    }));
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
                          enexPrice: 0,
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

                  {/* 빠른 일괄 복사 안내 팁 배너 */}
                  {activeSupplier.products && activeSupplier.products.length > 1 && (
                    <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-3 flex items-center justify-between text-xs text-purple-950">
                      <div className="flex items-center gap-2">
                        <Sparkles size={15} className="text-purple-600 shrink-0" />
                        <span>
                          <strong>💡 빠른 일괄 등록 팁</strong>: 기준 제품 1개의 본부 수수료와 수령처를 설정한 후, 우측의 <strong>[일괄복사]</strong> 버튼을 누르면 나머지 모든 제품에 1초 만에 동일하게 적용됩니다.
                        </span>
                      </div>
                      <span className="text-[11px] text-purple-700 font-bold bg-white px-2.5 py-1 rounded-lg border border-purple-200 shrink-0 flex items-center gap-1">
                        <ShieldCheck size={13} className="text-emerald-600" />
                        3중 자동안전저장 적용됨
                      </span>
                    </div>
                  )}

                  {/* 취급 제품 목록 테이블 */}
                  <div className="overflow-x-auto border border-slate-100 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold whitespace-nowrap">
                          <th className="p-3">매칭 제품명 (키워드)</th>
                          <th className="p-3">공식 표시 제품명</th>
                          <th className="p-3 text-right text-emerald-800">에넥스 입금가 (VAT포함)</th>
                          <th className="p-3 text-right">공급 단가 (VAT포함)</th>
                          <th className="p-3 text-right">공급 수수료 (단가, VAT포함)</th>
                          <th className="p-3">수수료 수령처/계좌</th>
                          <th className="p-3 text-center w-36">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(!activeSupplier.products || activeSupplier.products.length === 0) ? (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-slate-400 whitespace-nowrap">
                              등록된 취급 제품이 없습니다. 우측 상단 [+ 제품 추가] 버튼을 눌러 정확한 제품명을 선택하여 등록하세요.
                            </td>
                          </tr>
                        ) : (
                          activeSupplier.products.map((p, idx) => {
                            const comm = p.supplyCommission || p.hqCommissions?.[0]?.commission || 0;
                            return (
                              <tr key={p.id || idx} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                                <td className="p-3 font-mono font-bold text-indigo-700">
                                  <span className="bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100 text-xs">
                                    {p.productKeyword}
                                  </span>
                                </td>
                                <td className="p-3 font-bold text-slate-800">
                                  {p.productName}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-emerald-700 text-sm">
                                  {p.enexPrice ? (
                                    `${p.enexPrice.toLocaleString()}원`
                                  ) : (
                                    <span className="text-slate-300 font-normal text-xs">-</span>
                                  )}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-slate-900 text-sm">
                                  {(p.supplyPrice || 0).toLocaleString()}원
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setProductForm({ 
                                        ...p,
                                        supplyCommission: comm,
                                        hqCommissions: [{ id: 'all_hq', hqName: '전체본부', commission: comm }]
                                      });
                                      setEditingProductIdx(idx);
                                      setSelectedHqsForCommission([]);
                                      setTempHqCommission('');
                                      setCustomHqInput('');
                                      setIsDirectInputMode(false);
                                      setIsProductModalOpen(true);
                                    }}
                                    className="font-mono font-black text-purple-700 text-sm hover:underline cursor-pointer"
                                    title="클릭하여 수수료 수정"
                                  >
                                    {comm.toLocaleString()}원
                                  </button>
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
                                  {/* 일괄 복사 버튼 */}
                                  <button
                                    onClick={() => handleOpenBatchCopyModal(p)}
                                    className={`px-2 py-1 rounded-lg text-xs font-bold border cursor-pointer flex items-center gap-1 transition-colors ${
                                      p.hqCommissions && p.hqCommissions.length > 0
                                        ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200 shadow-2xs'
                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                                    }`}
                                    title="이 제품의 본부 수수료 및 수령처를 다른 제품들에 일괄 복사"
                                  >
                                    <Copy size={12} className={p.hqCommissions && p.hqCommissions.length > 0 ? "text-purple-600" : ""} />
                                    <span>일괄복사</span>
                                  </button>
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
                                    className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-lg text-xs font-bold border border-slate-200 cursor-pointer flex items-center gap-1 transition-colors"
                                    title="제품 단가 및 본부별 수수료 설정"
                                  >
                                    <Edit3 size={12} />
                                    <span>설정</span>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteProduct(idx, p.productName)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer transition-colors"
                                    title="삭제"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
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
                  {/* [0] 기존 다른 제품의 수수료/수령처 설정 불러오기 퀵 드롭다운 */}
                  {activeSupplier && activeSupplier.products && activeSupplier.products.length > 0 && (
                    <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-2.5 flex items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Copy size={13} className="text-purple-600 shrink-0" />
                        <span className="font-bold text-purple-950 text-xs whitespace-nowrap">
                          기존 제품 설정 가져오기:
                        </span>
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleLoadSettingsFromOtherProduct(e.target.value);
                              e.target.value = '';
                            }
                          }}
                          defaultValue=""
                          className="px-2.5 py-1 bg-white border border-purple-300 rounded-lg text-xs font-semibold text-purple-900 outline-none cursor-pointer flex-1 max-w-[280px]"
                        >
                          <option value="">-- 다른 제품의 본부 수수료 복사 --</option>
                          {activeSupplier.products
                            .filter((_, pIdx) => editingProductIdx === null || pIdx !== editingProductIdx)
                            .map((p) => {
                              const hqCount = (p.hqCommissions || []).length;
                              return (
                                <option key={p.id} value={p.id}>
                                  {p.productName || p.productKeyword} {hqCount > 0 ? `(${hqCount}개 본부 적용중)` : '(미설정)'}
                                </option>
                              );
                            })}
                        </select>
                      </div>
                      <span className="text-[10px] text-purple-600 font-semibold whitespace-nowrap hidden sm:inline">
                        * 본부별 수수료 및 수령처 자동 복사
                      </span>
                    </div>
                  )}

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

                  {/* [NEW] 에넥스 입금가 (건당 수납 단가) 입력 */}
                  <div className="p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-emerald-950 flex items-center gap-1.5 text-xs">
                        <DollarSign size={14} className="text-emerald-600" />
                        <span>에넥스 입금가 (건당 거래처 수납단가, VAT포함)</span>
                      </label>
                      <span className="text-[11px] text-emerald-700 font-bold bg-white px-2 py-0.5 rounded border border-emerald-200">
                        월말보고서 [E] 자동 연동
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="0"
                        value={productForm.enexPrice || ''}
                        onChange={(e) => setProductForm({ ...productForm, enexPrice: Number(e.target.value) })}
                        className="w-full px-3 py-2.5 bg-white border border-emerald-300 rounded-xl font-black font-mono text-base text-emerald-900 focus:ring-2 focus:ring-emerald-400 outline-none text-right pr-9"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-600 font-bold text-sm">원</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      * 에넥스(거래처)에서 수납 입금되는 제품 1건당 기준 입금가입니다. 설정해두면 월말보고서에 자동 반영됩니다.
                    </p>
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

                  {/* [2] 공급 수수료(특수수당 단가) 입력 */}
                  <div className="p-4 bg-purple-50/60 rounded-xl border border-purple-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-purple-900 flex items-center gap-1.5 text-xs">
                        <Tag size={14} className="text-purple-600" />
                        <span>공급 수수료 (특수수당 단가, VAT포함) *</span>
                      </label>
                      <span className="text-[11px] text-purple-700 font-medium">
                        * 상품 1건당 수수료 수령처에 지급
                      </span>
                    </div>

                    <div className="relative">
                      <input
                        type="number"
                        placeholder="0"
                        value={productForm.supplyCommission || ''}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setProductForm({ 
                            ...productForm, 
                            supplyCommission: val,
                            hqCommissions: [{ id: 'all_hq', hqName: '전체본부', commission: val }]
                          });
                        }}
                        className="w-full px-3 py-2.5 bg-white border border-purple-300 rounded-xl font-black font-mono text-base text-purple-900 focus:ring-2 focus:ring-purple-400 outline-none text-right pr-9"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-purple-500 font-bold text-sm">원</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      * 이 제품 배송완료 1건당 수수료 수령처에 지급할 공급 수수료(특수수당) 금액입니다. (본부 구분 없이 전 건 일괄 적용)
                    </p>
                  </div>

                  {/* 수수료 수령처 / 계좌정보 (본부 선택 연동 지원) */}
                  <div className="pt-3 border-t border-slate-200/80 bg-slate-50/70 -mx-6 px-6 py-3 rounded-b-2xl">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <CreditCard size={14} className="text-purple-600" />
                        <label className="font-bold text-slate-800 text-xs">
                          수수료 수령처 및 지급 계좌정보
                        </label>
                        <span className="text-[10px] bg-purple-100 text-purple-700 font-semibold px-1.5 py-0.5 rounded">
                          본부 계좌 연동
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleResetToSupplierAccount}
                          className="px-2 py-0.5 text-[11px] font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-md cursor-pointer transition-colors shadow-2xs"
                          title="이 공급사의 기본 계좌정보로 채웁니다"
                        >
                          공급사 기본계좌로 설정
                        </button>
                        {(productForm.commissionRecipient || productForm.recipientBank || productForm.recipientAccount || productForm.recipientHolder) && (
                          <button
                            type="button"
                            onClick={handleClearRecipient}
                            className="px-2 py-0.5 text-[11px] font-semibold text-rose-500 hover:bg-rose-50 border border-rose-200 rounded-md cursor-pointer transition-colors"
                          >
                            비우기
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {/* 본부 선택 셀렉트 */}
                      <div className="flex items-center gap-2">
                        <div className="text-[11px] font-bold text-slate-600 whitespace-nowrap min-w-[75px]">
                          수령 본부 선택:
                        </div>
                        <select
                          value={
                            hqAccountOptions.some(h => h.name === productForm.commissionRecipient)
                              ? (productForm.commissionRecipient || '')
                              : ''
                          }
                          onChange={(e) => handleSelectHqForRecipient(e.target.value)}
                          className="flex-1 px-2.5 py-1.5 bg-white border border-purple-200 rounded-lg text-xs font-semibold text-purple-900 focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none cursor-pointer shadow-2xs"
                        >
                          <option value="">-- 본부를 선택하면 해당 본부의 계좌정보가 자동 연동됩니다 --</option>
                          {hqAccountOptions.map((hq) => {
                            const hasAccount = hq.bankName && hq.bankName !== '-' && hq.accountNumber && hq.accountNumber !== '-';
                            return (
                              <option key={hq.name} value={hq.name}>
                                {hq.name} {hasAccount ? `(${hq.bankName} ${hq.accountNumber} · ${hq.accountHolder})` : '(계좌 미등록)'}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* 계좌 상세 입력 필드 (4분할: 수령처, 은행명, 계좌번호, 예금주) */}
                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 mb-0.5 block">수령처명 / 본부</label>
                          <input
                            type="text"
                            placeholder="수령처 (예: 맥스)"
                            value={productForm.commissionRecipient || ''}
                            onChange={(e) => setProductForm({ ...productForm, commissionRecipient: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 mb-0.5 block">은행명</label>
                          <input
                            type="text"
                            placeholder="은행명 (예: 우리)"
                            value={productForm.recipientBank || ''}
                            onChange={(e) => setProductForm({ ...productForm, recipientBank: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 mb-0.5 block">계좌번호</label>
                          <input
                            type="text"
                            placeholder="계좌번호"
                            value={productForm.recipientAccount || ''}
                            onChange={(e) => setProductForm({ ...productForm, recipientAccount: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-semibold focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 mb-0.5 block">예금주</label>
                          <input
                            type="text"
                            placeholder="예금주 성명"
                            value={productForm.recipientHolder || ''}
                            onChange={(e) => setProductForm({ ...productForm, recipientHolder: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                        <span className="text-[10px] text-slate-400">
                          * 미입력 시 공급사 기본 계좌로 자동 정산됩니다. 직접 수정하거나 위 본부를 선택하세요.
                        </span>
                        {productForm.commissionRecipient && (
                          <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 flex items-center gap-1">
                            <CheckCircle2 size={12} className="text-purple-600" />
                            지급처: {productForm.commissionRecipient}
                            {productForm.recipientBank && ` (${productForm.recipientBank} ${productForm.recipientHolder || ''})`}
                          </span>
                        )}
                      </div>
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

          {/* [모달 3] 수수료 설정 다른 제품에 일괄 복사 모달 */}
          {isBatchCopyModalOpen && sourceProductForCopy && activeSupplier && (
            <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 border border-slate-200 space-y-4 max-h-[92vh] flex flex-col"
              >
                {/* 헤더 */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                      <Copy size={18} />
                    </div>
                    <div>
                      <h4 className="text-base font-black text-slate-900">
                        수수료 설정 다른 제품에 일괄 복사
                      </h4>
                      <p className="text-xs text-slate-500">
                        기준 제품의 수수료 지급 대상 본부 및 수령처를 선택한 제품들에 한 번에 적용합니다.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsBatchCopyModalOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-4 text-xs overflow-y-auto custom-scrollbar flex-1 pr-1">
                  {/* 기준 제품 요약 카드 */}
                  <div className="bg-purple-50/80 border border-purple-200 rounded-xl p-3.5 space-y-2">
                    <div className="text-[11px] font-bold text-purple-700 flex items-center gap-1">
                      <Sparkles size={12} />
                      <span>복사 기준 제품:</span>
                    </div>
                    <div className="font-black text-sm text-slate-900">
                      {sourceProductForCopy.productName || sourceProductForCopy.productKeyword}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                      <div className="bg-white p-2.5 rounded-lg border border-purple-100 shadow-2xs">
                        <span className="text-[10px] text-slate-400 block font-medium">설정된 본부 수수료</span>
                        <span className="font-bold text-purple-900 block truncate">
                          {sourceProductForCopy.hqCommissions && sourceProductForCopy.hqCommissions.length > 0
                            ? `총 ${sourceProductForCopy.hqCommissions.length}개 본부 적용 중`
                            : '설정 없음 (미지급)'}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-purple-100 shadow-2xs">
                        <span className="text-[10px] text-slate-400 block font-medium">수수료 수령처 및 계좌</span>
                        <span className="font-bold text-slate-800 truncate block">
                          {sourceProductForCopy.commissionRecipient || activeSupplier.name}
                          {sourceProductForCopy.recipientBank && ` (${sourceProductForCopy.recipientBank})`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 복사할 항목 선택 */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-700 block text-xs">복사할 항목 선택:</span>
                    <div className="flex flex-col sm:flex-row gap-3 pt-0.5">
                      <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          checked={copyOptions.copyCommissions}
                          onChange={(e) => setCopyOptions({ ...copyOptions, copyCommissions: e.target.checked })}
                          className="w-4 h-4 text-purple-600 rounded cursor-pointer accent-purple-600"
                        />
                        <span>지급 대상 본부 및 수수료 금액 복사</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          checked={copyOptions.copyRecipient}
                          onChange={(e) => setCopyOptions({ ...copyOptions, copyRecipient: e.target.checked })}
                          className="w-4 h-4 text-purple-600 rounded cursor-pointer accent-purple-600"
                        />
                        <span>수수료 수령처 및 계좌정보 복사</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-500">
                        <input
                          type="checkbox"
                          checked={copyOptions.copySupplyPrice}
                          onChange={(e) => setCopyOptions({ ...copyOptions, copySupplyPrice: e.target.checked })}
                          className="w-4 h-4 text-purple-600 rounded cursor-pointer accent-purple-600"
                        />
                        <span>공급 단가도 함께 복사</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer font-semibold text-emerald-800">
                        <input
                          type="checkbox"
                          checked={copyOptions.copyEnexPrice}
                          onChange={(e) => setCopyOptions({ ...copyOptions, copyEnexPrice: e.target.checked })}
                          className="w-4 h-4 text-emerald-600 rounded cursor-pointer accent-emerald-600"
                        />
                        <span>에넥스 입금가도 함께 복사</span>
                      </label>
                    </div>
                  </div>

                  {/* 대상 제품 선택 목록 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">
                        설정을 적용할 대상 제품 선택 ({targetProductIdsForCopy.length}개 선택됨):
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleSelectAllTargets}
                          className="px-2.5 py-1 text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md border border-purple-200 cursor-pointer transition-colors"
                        >
                          전체 선택
                        </button>
                        <button
                          type="button"
                          onClick={handleDeselectAllTargets}
                          className="px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 rounded-md border border-slate-200 cursor-pointer transition-colors"
                        >
                          선택 해제
                        </button>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-60 overflow-y-auto custom-scrollbar">
                      {((activeSupplier.products || []).filter(p => p.id !== sourceProductForCopy.id).length === 0) ? (
                        <div className="p-4 text-center text-slate-400">
                          복사할 다른 제품이 없습니다.
                        </div>
                      ) : (
                        (activeSupplier.products || [])
                          .filter(p => p.id !== sourceProductForCopy.id)
                          .map((prod) => {
                            const isSelected = targetProductIdsForCopy.includes(prod.id);
                            const hasComm = prod.hqCommissions && prod.hqCommissions.length > 0;
                            return (
                              <div
                                key={prod.id}
                                onClick={() => handleToggleTargetProduct(prod.id)}
                                className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                                  isSelected ? 'bg-purple-50/70' : 'hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}} // 부모 클릭 핸들러 사용
                                    className="w-4 h-4 text-purple-600 rounded cursor-pointer pointer-events-none accent-purple-600"
                                  />
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-900 truncate">
                                      {prod.productName || prod.productKeyword}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      공급가: {(prod.supplyPrice || 0).toLocaleString()}원
                                    </div>
                                  </div>
                                </div>

                                <div className="shrink-0 text-right">
                                  {hasComm ? (
                                    <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full">
                                      기존 {prod.hqCommissions!.length}개 본부 설정됨
                                    </span>
                                  ) : (
                                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                                      미지급 상태
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>
                </div>

                {/* 하단 확인 버튼 */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0">
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
                    <span>적용 즉시 3중 안전 저장 및 구글 시트에 자동 저장됩니다.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsBatchCopyModalOpen(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyBatchCopy}
                      disabled={targetProductIdsForCopy.length === 0}
                      className={`px-5 py-2 rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 transition-all ${
                        targetProductIdsForCopy.length > 0
                          ? 'bg-purple-600 hover:bg-purple-700 text-white'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <Copy size={14} />
                      <span>선택한 {targetProductIdsForCopy.length}개 제품에 일괄 적용</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
