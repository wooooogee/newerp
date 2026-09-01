import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { X, Search, Save, Download, RefreshCw, Truck, Package, CheckCircle2, Plus, Trash2, Settings, ChevronDown, ChevronUp, ExternalLink, CheckSquare, Square, FileSpreadsheet, Calendar, Filter, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// @ts-ignore
const XLSX = (window as any).XLSX;

interface ERPDataItem {
  uniqueKey: string;
  originalRowIdx: number;
  contractDate: string;
  memNo: string;
  memName: string;
  resNo: string;
  phone: string;
  prodName: string;
  rentalProd: string;
  rentalNo: string;
  deliveryStatus: string;
  deliveryDate: string;
  payDate: string;
  hq: string;
  branch: string;
  empName: string;
  status: string;
  raw: any[];
}

interface ManualOrderManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ERPDataItem[];
}

export type DeliveryState = '발주대기' | '발주완료' | '배송중' | '배송완료';

interface OrderRow {
  uniqueKey: string;
  rowIdx?: number; // 수기발주 시트 1-indexed 행 번호 (있을 경우)
  contractNo: string; // 계약번호 (K열 렌탈계약번호 또는 C열 회원번호)
  contractDate: string; // A열 계약일자
  requestDate: string; // 수기발주 O열 요청일 (14)
  memName: string; // D열 회원명
  phone: string; // F열 핸드폰
  rentalProdRaw: string; // 원본 렌탈상품명
  rentalProdClean: string; // 정제된 렌탈상품명
  status: string; // B열 가입상태
  address: string; // 수기발주 L열 주소 (11)
  zipCode: string; // 수기발주 K열 우편번호 (10)

  // 입력/저장 가능한 배송 정보
  orderDate: string; // 발주일
  deliveryDate: string; // 배송일/설치일 (수기 U열 / 20)
  courier: string; // 택배사 (수기 V열 / 21)
  trackingNo: string; // 송장번호 (수기 W열 / 22)
  deliveryState: DeliveryState; // 배송상태 구별

  rawOrderRow?: any[];
}

const DEFAULT_TARGET_PRODUCTS = [
  '뉴스카이타워G9 3in1',
  'G210NW',
  'CRVC-CAC1620W',
  '가스트로플러스',
  '쿠쿠',
];

const COURIER_OPTIONS = [
  '롯데택배',
  'CJ대한통운',
  '한진택배',
  '우체국택배',
  '로젠택배',
  '경동택배',
  '대신화물',
  '합동택배',
];

const LOCAL_STORAGE_KEY = 'erp_manual_order_target_products_v1';

// 상품명에서 구좌 접두사 제거 (예: 1구좌_ -> 순수 상품명)
const cleanProductName = (name: string): string => {
  if (!name) return '';
  return name.replace(/^[0-9]+구좌[_\s]*/g, '').trim();
};

// 택배사 이름 정규화 (예: '롯데' -> '롯데택배', 'CJ' -> 'CJ대한통운')
export const normalizeCourierName = (courier: string): string => {
  if (!courier) return '';
  const trimmed = courier.trim();
  if (!trimmed) return '';
  if (COURIER_OPTIONS.includes(trimmed)) return trimmed;

  if (trimmed.includes('롯데')) return '롯데택배';
  if (trimmed.includes('CJ') || trimmed.includes('대한통운')) return 'CJ대한통운';
  if (trimmed.includes('한진')) return '한진택배';
  if (trimmed.includes('우체국')) return '우체국택배';
  if (trimmed.includes('로젠')) return '로젠택배';
  if (trimmed.includes('경동')) return '경동택배';
  if (trimmed.includes('대신')) return '대신화물';
  if (trimmed.includes('합동')) return '합동택배';

  return trimmed;
};

// 택배사 배송조회 URL
const getTrackingUrl = (courier: string, trackingNo: string) => {
  const cleanTracking = trackingNo.replace(/[^0-9a-zA-Z]/g, '');
  const cName = courier.trim();

  if (cName.includes('롯데')) {
    return `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${cleanTracking}`;
  } else if (cName.includes('CJ') || cName.includes('대한통운')) {
    return `https://www.cjlogistics.com/ko/tool/parcel/tracking?gnbIntegSearch=${cleanTracking}`;
  } else if (cName.includes('한진')) {
    return `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&wblnum=${cleanTracking}`;
  } else if (cName.includes('우체국')) {
    return `https://service.epost.go.kr/trace.RetrieveDomRレースService.comm?displayHeader=N&sid1=${cleanTracking}`;
  } else if (cName.includes('로젠')) {
    return `https://www.ilogen.com/m/personal/trace/${cleanTracking}`;
  } else if (cName.includes('경동')) {
    return `https://search.naver.com/search.naver?query=${encodeURIComponent('경동택배 ' + cleanTracking)}`;
  }
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(courier + ' ' + trackingNo)}`;
};

export const ManualOrderManagementModal: React.FC<ManualOrderManagementModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [targetProducts, setTargetProducts] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load target products', e);
    }
    return DEFAULT_TARGET_PRODUCTS;
  });

  const [newProductInput, setNewProductInput] = useState('');
  const [showProductConfig, setShowProductConfig] = useState(false);
  const [sheetOrderRows, setSheetOrderRows] = useState<any[]>([]);

  const [savedOrderStore, setSavedOrderStore] = useState<Record<string, { orderDate?: string; deliveryDate?: string; courier?: string; trackingNo?: string; deliveryState?: DeliveryState }>>(() => {
    try {
      const saved = localStorage.getItem('erp_manual_orders_saved_store_v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  const [editedValues, setEditedValues] = useState<Record<string, { orderDate?: string; deliveryDate?: string; courier?: string; trackingNo?: string }>>({});
  const [editedStates, setEditedStates] = useState<Record<string, DeliveryState>>({});
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [requestDateFilter, setRequestDateFilter] = useState<'all' | 'has_value' | 'no_value'>('all');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [stateFilter, setStateFilter] = useState<'all' | DeliveryState>('all');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 발주서 엑셀 팝업 모달 상태
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  // 연락처 숫자 정제 (01000000000)
  const formatPhoneNum = (val: any) => {
    const str = String(val || '').trim();
    const digits = str.replace(/[^0-9]/g, '');
    return digits || str;
  };

  // 우편번호 5자리 정제 (00000)
  const formatZipCodeNum = (val: any) => {
    const str = String(val || '').trim();
    const digits = str.replace(/[^0-9]/g, '');
    if (!digits) return str;
    return digits.padStart(5, '0');
  };

  // XLSX 셀 텍스트 서식(string type, z='@') 지정 헬퍼
  const applyTextFormatToSheet = (ws: any) => {
    if (!ws || typeof ws !== 'object') return;
    Object.keys(ws).forEach((cellKey) => {
      if (cellKey.startsWith('!')) return;
      const cell = ws[cellKey];
      if (cell && typeof cell === 'object') {
        cell.t = 's'; // 문자열 타입 강제 설정 (앞자리 0 보존)
        cell.z = '@';
      }
    });
  };

  const handleCopyContractNo = (contractNo: string) => {
    if (!contractNo) return;
    try {
      navigator.clipboard.writeText(contractNo);
      setNotification({ message: `계약번호 [${contractNo}] 가 클립보드에 복사되었습니다!`, type: 'success' });
    } catch (e) {
      console.error('Copy error:', e);
    }
  };

  const handleAddProduct = () => {
    const trimmed = newProductInput.trim();
    if (!trimmed) return;
    if (targetProducts.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      alert('이미 등록된 상품명입니다.');
      return;
    }
    setTargetProducts((prev) => [...prev, trimmed]);
    setNewProductInput('');
  };

  const handleRemoveProduct = (prodToRemove: string) => {
    setTargetProducts((prev) => prev.filter((p) => p !== prodToRemove));
  };

  const [sheetOrderMap, setSheetOrderMap] = useState<Map<string, { rowIdx: number; requestDate: string; deliveryDate: string; courier: string; trackingNo: string; address: string; zipCode: string; raw: any[] }>>(new Map());

  const fetchOrderSheetData = useCallback(async () => {
    setLoading(true);
    try {
      const timestamp = Date.now();
      const res = await fetch(`/api/sheets/sheetData?sheetName=${encodeURIComponent('수기발주')}&t=${timestamp}`);
      if (!res.ok) throw new Error('수기발주 시트 로드 실패');
      const rows: any[][] = await res.json();
      setSheetOrderRows(Array.isArray(rows) ? rows : []);

      const map = new Map<string, { rowIdx: number; requestDate: string; deliveryDate: string; courier: string; trackingNo: string; address: string; zipCode: string; raw: any[] }>();

      if (Array.isArray(rows) && rows.length >= 2) {
        const headerRow = (rows[0] || []).map((h: any) => String(h || '').trim());
        const findCol = (keywords: string[], defaultIdx: number) => {
          const found = headerRow.findIndex((h: string) => keywords.some((kw) => h === kw || h.includes(kw)));
          return found !== -1 ? found : defaultIdx;
        };

        const contractNoCol = findCol(['계약번호', '렌탈계약번호', '회원번호'], 1); // 기본 B열 (index 1)
        const reqDateCol = findCol(['요청일', '요청일자', '발주일자'], 14); // 기본 O열 (index 14)
        const delDateCol = findCol(['배송일', '배송일자', '설치일'], 20); // 기본 U열 (index 20)
        const courierCol = findCol(['택배사', '배송업체'], 21); // 기본 V열 (index 21)
        const trackingCol = findCol(['송장번호', '운송장번호'], 22); // 기본 W열 (index 22)
        const addressCol = findCol(['주소', '배송지'], 11); // 기본 L열 (index 11)
        const zipCodeCol = findCol(['우편번호'], 10); // 기본 K열 (index 10)

        rows.slice(1).forEach((row, idx) => {
          const rowIdx = idx + 2;
          // B열 (index 1) 또는 헤더 매칭 계약번호
          const rawContractNo = String(row[contractNoCol] || row[1] || '').trim();
          if (!rawContractNo) return;

          const reqDate = String(row[reqDateCol] !== undefined ? row[reqDateCol] : (row[14] || '')).trim();
          const address = String(row[addressCol] !== undefined ? row[addressCol] : (row[11] || '')).trim();
          const zipCode = String(row[zipCodeCol] !== undefined ? row[zipCodeCol] : (row[10] || '')).trim();
          const delDate = String(row[delDateCol] !== undefined ? row[delDateCol] : (row[20] || '')).trim();
          const courier = String(row[courierCol] !== undefined ? row[courierCol] : (row[21] || '')).trim();
          const tracking = String(row[trackingCol] !== undefined ? row[trackingCol] : (row[22] || '')).trim();

          const matchObj = {
            rowIdx,
            requestDate: reqDate,
            address,
            zipCode,
            deliveryDate: delDate,
            courier,
            trackingNo: tracking,
            raw: row,
          };

          const keyRaw = rawContractNo;
          const keyUpper = rawContractNo.toUpperCase();
          const keyDigits = rawContractNo.replace(/[^0-9]/g, '');

          map.set(keyRaw, matchObj);
          if (keyUpper !== keyRaw) map.set(keyUpper, matchObj);
          if (keyDigits && keyDigits !== keyRaw) map.set(keyDigits, matchObj);
        });
      }
      setSheetOrderMap(map);
    } catch (err: any) {
      console.warn('수기발주 시트 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchOrderSheetData();
  }, [isOpen, fetchOrderSheetData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(targetProducts));
    }, 500);
    return () => clearTimeout(timer);
  }, [targetProducts]);

  const extractedOrders = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    const list: OrderRow[] = [];
    const seenContracts = new Set<string>();

    data.forEach((item) => {
      const rawProdName = (item.rentalProd || item.prodName || '').trim();
      if (!rawProdName) return;

      const cleanProdName = cleanProductName(rawProdName);
      const isTarget = targetProducts.some(
        (tp) => rawProdName.toLowerCase().includes(tp.toLowerCase()) || cleanProdName.toLowerCase().includes(tp.toLowerCase())
      );
      if (!isTarget || String(item.status || '').trim() !== '가입') return;

      const contractNo = (item.rentalNo || item.memNo || '').trim();
      if (!contractNo || seenContracts.has(contractNo.toUpperCase())) return;
      seenContracts.add(contractNo.toUpperCase());

      const cNoUpper = contractNo.toUpperCase();
      const cNoDigits = contractNo.replace(/[^0-9]/g, '');
      const sheetMatch = sheetOrderMap.get(contractNo) || sheetOrderMap.get(cNoUpper) || (cNoDigits ? sheetOrderMap.get(cNoDigits) : undefined);
      const savedData = savedOrderStore[cNoUpper] || savedOrderStore[contractNo] || (cNoDigits ? savedOrderStore[cNoDigits] : undefined);

      // 요청일자는 오직 B열 매칭된 수기발주 시트 O열(index 14)에서만 취득
      const reqDate = sheetMatch?.requestDate || '';

      const ordDate = savedData?.orderDate || '';
      const delDate = savedData?.deliveryDate !== undefined ? savedData.deliveryDate : (sheetMatch?.deliveryDate || item.deliveryDate || '');
      const rawCourier = savedData?.courier !== undefined ? savedData.courier : (sheetMatch?.courier || '');
      const courier = normalizeCourierName(rawCourier);
      const tracking = savedData?.trackingNo !== undefined ? savedData.trackingNo : (sheetMatch?.trackingNo || '');

      let dState: DeliveryState = savedData?.deliveryState || (sheetMatch?.raw?.[23] as DeliveryState) || '발주대기';
      if (dState === '발주대기' && (delDate.trim() || tracking.trim() || courier.trim())) dState = '배송중';

      list.push({
        uniqueKey: item.uniqueKey || `item-${contractNo}`,
        rowIdx: sheetMatch?.rowIdx,
        contractNo,
        contractDate: item.contractDate || '',
        requestDate: reqDate,
        memName: item.memName || '',
        phone: item.phone || '',
        rentalProdRaw: rawProdName,
        rentalProdClean: cleanProdName,
        status: item.status || '가입',
        address: sheetMatch?.address || '',
        zipCode: sheetMatch?.zipCode || '',
        orderDate: ordDate,
        deliveryDate: delDate,
        courier,
        trackingNo: tracking,
        deliveryState: dState,
        rawOrderRow: sheetMatch?.raw,
      });
    });
    return list;
  }, [data, targetProducts, sheetOrderMap, savedOrderStore]);

  // 렌탈상품 목록 옵션
  const availableProductOptions = useMemo(() => {
    const prods = new Set<string>();
    extractedOrders.forEach((o) => prods.add(o.rentalProdClean));
    return Array.from(prods).sort();
  }, [extractedOrders]);

  const handleStateChange = (contractNo: string, nextState: DeliveryState) => {
    const today = new Date().toISOString().slice(0, 10);
    setEditedStates((prev) => ({ ...prev, [contractNo]: nextState }));
    
    const currentOrder = extractedOrders.find((o) => o.contractNo === contractNo);
    const curOrdDate = editedValues[contractNo]?.orderDate ?? savedOrderStore[contractNo]?.orderDate ?? currentOrder?.orderDate ?? '';
    const curDelDate = editedValues[contractNo]?.deliveryDate ?? savedOrderStore[contractNo]?.deliveryDate ?? currentOrder?.deliveryDate ?? '';

    if (nextState === '발주완료' && !curOrdDate.trim()) handleInputChange(contractNo, 'orderDate', today);
    if (nextState === '배송중' && !curDelDate.trim()) handleInputChange(contractNo, 'deliveryDate', today);
  };

  const handleBulkStateChange = (targetState: DeliveryState) => {
    if (selectedKeys.size === 0) {
      alert('배송상태를 변경할 항목을 최소 1개 이상 체크해 주세요.');
      return;
    }

    const targets = extractedOrders.filter((o) => selectedKeys.has(o.uniqueKey));
    if (targets.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);

    setEditedStates((prev) => {
      const next = { ...prev };
      targets.forEach((t) => {
        next[t.contractNo] = targetState;
      });
      return next;
    });

    // 일괄 발주완료 / 배송중 시 날짜 자동 채움
    targets.forEach((t) => {
      const curOrdDate = editedValues[t.contractNo]?.orderDate ?? savedOrderStore[t.contractNo]?.orderDate ?? t.orderDate ?? '';
      const curDelDate = editedValues[t.contractNo]?.deliveryDate ?? savedOrderStore[t.contractNo]?.deliveryDate ?? t.deliveryDate ?? '';

      if (targetState === '발주완료' && !curOrdDate.trim()) {
        handleInputChange(t.contractNo, 'orderDate', today);
      } else if (targetState === '배송중' && !curDelDate.trim()) {
        handleInputChange(t.contractNo, 'deliveryDate', today);
      }
    });

    if (stateFilter !== 'all' && stateFilter !== targetState) {
      setStateFilter('all');
    }

    setNotification({
      message: `선택된 ${targets.length}건의 배송상태가 [${targetState}] (으)로 변경되었습니다. 상단 [저장하기] 버튼을 눌러 확정하세요.`,
      type: 'success',
    });
  };

  const handleInputChange = (contractNo: string, field: 'orderDate' | 'deliveryDate' | 'courier' | 'trackingNo', value: string) => {
    setEditedValues((prev) => ({
      ...prev,
      [contractNo]: {
        ...prev[contractNo],
        [field]: value,
      },
    }));
  };

  const getFieldValue = (row: OrderRow, field: 'orderDate' | 'deliveryDate' | 'courier' | 'trackingNo') => {
    if (editedValues[row.contractNo] && editedValues[row.contractNo][field] !== undefined) {
      return editedValues[row.contractNo][field]!;
    }
    return row[field];
  };

  const getRowDeliveryState = (row: OrderRow): DeliveryState => {
    if (editedStates[row.contractNo]) {
      return editedStates[row.contractNo];
    }
    return row.deliveryState;
  };

  const isChanged = useMemo(() => {
    const hasValueEdit = Object.keys(editedValues).some((cNo) => {
      const row = extractedOrders.find((o) => o.contractNo === cNo);
      if (!row) return false;
      const edited = editedValues[cNo];
      if (edited.deliveryDate !== undefined && edited.deliveryDate !== row.deliveryDate) return true;
      if (edited.courier !== undefined && edited.courier !== row.courier) return true;
      if (edited.trackingNo !== undefined && edited.trackingNo !== row.trackingNo) return true;
      return false;
    });

    const hasStateEdit = Object.keys(editedStates).some((cNo) => {
      const row = extractedOrders.find((o) => o.contractNo === cNo);
      if (!row) return false;
      return editedStates[cNo] !== row.deliveryState;
    });

    return hasValueEdit || hasStateEdit;
  }, [editedValues, editedStates, extractedOrders]);

  // 요청일자 필터 1차 적용 리스트 (배송상태 탭 카운트 및 독립 필터링 연동용)
  const ordersFilteredByReqDate = useMemo(() => {
    return extractedOrders.filter((order) => {
      if (requestDateFilter === 'has_value') {
        if (!order.requestDate || !order.requestDate.trim()) return false;
      } else if (requestDateFilter === 'no_value') {
        if (order.requestDate && order.requestDate.trim()) return false;
      }
      return true;
    });
  }, [extractedOrders, requestDateFilter]);

  // 검색 및 요청일(O열 탭), 상품명 다중선택, 상태 필터링
  const filteredOrders = useMemo(() => {
    return extractedOrders.filter((order) => {
      const currentState = getRowDeliveryState(order);

      // 요청일자 1클릭 탭 필터
      if (requestDateFilter === 'has_value') {
        if (!order.requestDate || !order.requestDate.trim()) return false;
      } else if (requestDateFilter === 'no_value') {
        if (order.requestDate && order.requestDate.trim()) return false;
      }

      // 배송상태 탭 필터
      if (stateFilter !== 'all' && currentState !== stateFilter) return false;

      // 렌탈상품 다중 선택 필터
      if (selectedProducts.size > 0 && !selectedProducts.has(order.rentalProdClean)) {
        return false;
      }

      if (!searchTerm.trim()) return true;

      const term = searchTerm.trim().toLowerCase();
      const matchContract = order.contractNo.toLowerCase().includes(term);
      const matchDate = order.contractDate.toLowerCase().includes(term);
      const matchReqDate = order.requestDate.toLowerCase().includes(term);
      const matchMemName = order.memName.toLowerCase().includes(term);
      const matchPhone = order.phone.toLowerCase().includes(term);
      const matchProd = order.rentalProdClean.toLowerCase().includes(term);
      const matchCourier = getFieldValue(order, 'courier').toLowerCase().includes(term);
      const matchTracking = getFieldValue(order, 'trackingNo').toLowerCase().includes(term);

      return matchContract || matchDate || matchReqDate || matchMemName || matchPhone || matchProd || matchCourier || matchTracking;
    });
  }, [extractedOrders, editedValues, editedStates, requestDateFilter, stateFilter, selectedProducts, searchTerm]);

  // 체크박스 핸들러
  const handleToggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedKeys.size === filteredOrders.length && filteredOrders.length > 0) {
      setSelectedKeys(new Set());
    } else {
      const allKeys = new Set(filteredOrders.map((o) => o.uniqueKey));
      setSelectedKeys(allKeys);
    }
  };

  // 배송상태 및 배송정보 [저장하기] (구글 시트 및 독자 영구 저장소에 보관)
  const handleSaveChanges = async () => {
    const allEditedContractNos = new Set([
      ...Object.keys(editedValues),
      ...Object.keys(editedStates),
    ]);

    if (allEditedContractNos.size === 0) {
      setNotification({ message: '변경된 배송 정보나 상태가 없습니다.', type: 'error' });
      return;
    }

    setSaving(true);
    setNotification(null);

    try {
      const nextStore = { ...savedOrderStore };
      const sheetUpdates: { rowIdx: number; colIdx: number; newValue: string }[] = [];

      allEditedContractNos.forEach((cNo) => {
        const row = extractedOrders.find((o) => o.contractNo === cNo);
        if (!row) return;

        const cKey = cNo.toUpperCase();
        const editedVal = editedValues[cNo];
        const editedSt = editedStates[cNo];

        const existing = nextStore[cKey] || nextStore[cNo] || {};

        let newOrdDate = editedVal?.orderDate !== undefined ? editedVal.orderDate : (existing.orderDate ?? row.orderDate ?? '');
        let newDelDate = editedVal?.deliveryDate !== undefined ? editedVal.deliveryDate : (existing.deliveryDate ?? row.deliveryDate ?? '');
        let newCourier = editedVal?.courier !== undefined ? normalizeCourierName(editedVal.courier.trim()) : (existing.courier ?? row.courier ?? '');
        let newTracking = editedVal?.trackingNo !== undefined ? editedVal.trackingNo.trim() : (existing.trackingNo ?? row.trackingNo ?? '');
        let newDState = editedSt !== undefined ? editedSt : (existing.deliveryState ?? row.deliveryState ?? '발주대기');

        // 배송 정보(배송일, 택배사, 송장번호)가 채워져 있는데 상태가 발주대기면 자동으로 '배송중'으로 업그레이드
        if (newDState === '발주대기' && (newDelDate.trim() || newCourier.trim() || newTracking.trim())) {
          newDState = '배송중';
        }

        nextStore[cKey] = {
          orderDate: newOrdDate,
          deliveryDate: newDelDate,
          courier: newCourier,
          trackingNo: newTracking,
          deliveryState: newDState,
        };
        // 구글 시트 업데이트 객체 생성 (rowIdx가 존재하는 수기발주 건)
        if (row.rowIdx) {
          sheetUpdates.push({ rowIdx: row.rowIdx, colIdx: 20, newValue: newDelDate });
          sheetUpdates.push({ rowIdx: row.rowIdx, colIdx: 21, newValue: newCourier });
          sheetUpdates.push({ rowIdx: row.rowIdx, colIdx: 22, newValue: newTracking });
          sheetUpdates.push({ rowIdx: row.rowIdx, colIdx: 23, newValue: newDState });
        }
      });

      // 1. 구글 시트 '수기발주' 시트에 배치 업데이트
      if (sheetUpdates.length > 0) {
        const res = await fetch('/api/sheets/batch-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sheetName: '수기발주',
            updates: sheetUpdates,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.warn('구글 시트 저장 응답 이상:', errData);
        }
      }

      // 2. localStore 업데이트
      setSavedOrderStore(nextStore);
      localStorage.setItem('erp_manual_orders_saved_store_v1', JSON.stringify(nextStore));

      // 3. 최신 시트 데이터 동기화
      await fetchOrderSheetData();

      setNotification({
        message: `성공적으로 ${allEditedContractNos.size}건의 배송정보 및 배송상태가 구글 시트와 저장소에 저장되었습니다!`,
        type: 'success',
      });

      setEditedValues({});
      setEditedStates({});
      setSelectedKeys(new Set());
    } catch (err: any) {
      console.error('저장 중 오류:', err);
      setNotification({ message: err.message || '저장 중 오류가 발생했습니다.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenTracking = (courier: string, trackingNo: string) => {
    if (!courier.trim() || !trackingNo.trim()) {
      alert('택배사와 송장번호를 모두 입력해주세요.');
      return;
    }
    const url = getTrackingUrl(courier, trackingNo);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const selectedOrdersList = useMemo(() => {
    return extractedOrders.filter((o) => selectedKeys.has(o.uniqueKey));
  }, [extractedOrders, selectedKeys]);

  const handleOpenOrderModal = () => {
    if (selectedKeys.size === 0) {
      alert('발주서 엑셀을 생성할 항목을 최소 1개 이상 체크해 주세요.');
      return;
    }
    setIsOrderModalOpen(true);
  };

  // 기존 발주서 엑셀 다운로드 (4개 필드: 받는분, 연락처, 받는분주소, 상품명)
  const handleDownloadOrderExcel = () => {
    if (!XLSX) {
      alert('XLSX 라이브러리를 로드하지 못했습니다.');
      return;
    }

    if (selectedOrdersList.length === 0) {
      alert('발주서 엑셀을 생성할 항목을 최소 1개 이상 체크해 주세요.');
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const headers = ['NO', '받는분', '연락처', '받는분주소', '상품명'];

    const exportRows = selectedOrdersList.map((o, idx) => [
      idx + 1,
      o.memName,
      formatPhoneNum(o.phone),
      o.address,
      o.rentalProdClean,
    ]);

    const wsData = [headers, ...exportRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    applyTextFormatToSheet(ws);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '발주서');
    XLSX.writeFile(wb, `수기발주서_${todayStr}.xlsx`);
  };

  // 에넥스 업로드 엑셀 다운로드
  // (수기발주 구글 시트 원본 rows를 그대로 사용 + 렌탈계약번호[B열/1] 기준으로 U배송일, V택배사, W송장번호, X설치유형 덮어써서 출력)
  const handleDownloadEnexExcel = () => {
    if (!XLSX) {
      alert('XLSX 라이브러리를 로드하지 못했습니다.');
      return;
    }

    if (!Array.isArray(sheetOrderRows) || sheetOrderRows.length <= 1) {
      alert('수기발주 시트 데이터가 없거나 로드되지 않았습니다.');
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const headers = sheetOrderRows[0].map((h: any) => String(h || ''));

    // 화면에서 체크 선택된 계약건들의 계약번호 목록
    const selectedContractNos = new Set(
      selectedOrdersList.map((o) => o.contractNo.toUpperCase())
    );

    const exportRows: any[][] = [];

    // 수기발주 시트 데이터 행(1행부터 끝까지) 순회
    sheetOrderRows.slice(1).forEach((row) => {
      const contractNoInSheet = String(row[1] || '').trim(); // B열 렌탈계약번호
      const cKey = contractNoInSheet.toUpperCase();

      // 체크 선택된 항목이 있는 경우, 선택된 렌탈계약번호만 추출 (선택이 없으면 수기발주 시트 전체)
      if (selectedContractNos.size > 0 && !selectedContractNos.has(cKey)) {
        return;
      }

      // 수기발주 시트 원본 행 복사
      const rowCopy = [...row];

      // 화면/입력값(extractedOrders, editedValues)에서 렌탈계약번호 매칭
      const matchedOrder = extractedOrders.find(
        (o) => o.contractNo.toUpperCase() === cKey
      );

      let delDate = String(rowCopy[20] || '').trim();
      let courier = normalizeCourierName(String(rowCopy[21] || '').trim());
      let tracking = String(rowCopy[22] || '').trim();

      if (matchedOrder) {
        delDate = getFieldValue(matchedOrder, 'deliveryDate');
        courier = normalizeCourierName(getFieldValue(matchedOrder, 'courier'));
        tracking = getFieldValue(matchedOrder, 'trackingNo').trim();
      } else {
        const editedVal = editedValues[contractNoInSheet] || editedValues[cKey];
        const savedVal = savedOrderStore[cKey] || savedOrderStore[contractNoInSheet];

        if (editedVal?.deliveryDate !== undefined) delDate = editedVal.deliveryDate;
        else if (savedVal?.deliveryDate !== undefined) delDate = savedVal.deliveryDate;

        if (editedVal?.courier !== undefined) courier = normalizeCourierName(editedVal.courier);
        else if (savedVal?.courier !== undefined) courier = normalizeCourierName(savedVal.courier);

        if (editedVal?.trackingNo !== undefined) tracking = editedVal.trackingNo.trim();
        else if (savedVal?.trackingNo !== undefined) tracking = (savedVal.trackingNo || '').trim();
      }

      // 수기발주 시트 O열(14) 요청일자 확인 (요청일자 있는 값만 적용)
      const requestDateInSheet = matchedOrder ? matchedOrder.requestDate : String(rowCopy[14] || '').trim();
      if (!requestDateInSheet || !requestDateInSheet.trim()) {
        return; // 요청일자가 없으면 에넥스 업로드 엑셀 대상 제외
      }

      // 배송일(U열/delDate) 값이 있을 때만 설치유형(X열) 적용 (송장 있으면 "택배", 없으면 "배송설치")
      // 배송일 값이 없으면 공란("")
      const installType = (delDate && delDate.trim()) ? (tracking ? '택배' : '배송설치') : '';

      // 핸드폰/연락처 (F열/index 5, J열/index 9) 및 우편번호 (K열/index 10) 텍스트 포맷팅 (앞자리 0 보존)
      if (rowCopy[5] !== undefined) rowCopy[5] = formatPhoneNum(rowCopy[5]);
      if (rowCopy[6] !== undefined) rowCopy[6] = formatPhoneNum(rowCopy[6]);
      if (rowCopy[9] !== undefined) rowCopy[9] = formatPhoneNum(rowCopy[9]);
      if (rowCopy[10] !== undefined) rowCopy[10] = formatZipCodeNum(rowCopy[10]);

      // U(20), V(21), W(22), X(23) 열 덮어쓰기
      rowCopy[20] = delDate;
      rowCopy[21] = courier;
      rowCopy[22] = tracking;
      rowCopy[23] = installType;

      exportRows.push(rowCopy);
    });

    if (exportRows.length === 0) {
      alert('출력할 수기발주 시트 항목이 없습니다.');
      return;
    }

    const wsData = [headers, ...exportRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '에넥스업로드');
    XLSX.writeFile(wb, `에넥스_업로드_파일_${todayStr}.xlsx`);
  };

  const handleExportMainExcel = () => {
    if (!XLSX) {
      alert('XLSX 라이브러리를 로드하지 못했습니다.');
      return;
    }

    const excelData = filteredOrders.map((o) => ({
      계약일자: o.contractDate,
      요청일자: o.requestDate,
      계약번호: o.contractNo,
      회원명: o.memName,
      핸드폰: o.phone,
      렌탈상품명: o.rentalProdClean,
      배송상태: getRowDeliveryState(o),
      '배송일/설치일': getFieldValue(o, 'deliveryDate'),
      택배사: getFieldValue(o, 'courier'),
      송장번호: getFieldValue(o, 'trackingNo'),
      받는분주소: o.address,
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '발주관리');
    XLSX.writeFile(wb, `수기발주_발주관리_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!isOpen) return null;

  const isAllSelected = filteredOrders.length > 0 && selectedKeys.size === filteredOrders.length;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-2 md:p-4 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 10 }}
          className="bg-white border border-slate-200 text-slate-800 w-full max-w-[1850px] w-[98vw] h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20">
                <Truck className="w-5.5 h-5.5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">발주 관리 (수기발주)</h2>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-medium">
                    원클릭 상태 변동 & 요청일자 필터 지원
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  수기발주 대상 상품의 접수건을 조회 및 배송 관리합니다.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowProductConfig(!showProductConfig)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  showProductConfig
                    ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-xs'
                    : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                <Settings size={14} className="text-blue-600" />
                수기발주 대상 상품 관리 ({targetProducts.length})
                {showProductConfig ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <button
                onClick={fetchOrderSheetData}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                title="데이터 새로고침"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin text-blue-600' : 'text-slate-500'} />
                새로고침
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Product Config Bar */}
          <AnimatePresence>
            {showProductConfig && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border-b border-slate-200 bg-blue-50/40 p-4"
              >
                <div className="flex flex-col gap-3 max-w-5xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Package size={15} />
                      수기발주 대상 렌탈상품명 설정
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      * 이 상품명이 포함된 계약 건만 발주 관리 리스트에 표시됩니다.
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="수기발주 대상 상품명 키워드 입력 (예: 뉴스카이타워G9, 쿠쿠 안마의자)..."
                      value={newProductInput}
                      onChange={(e) => setNewProductInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddProduct()}
                      className="flex-1 max-w-md px-3.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
                    />
                    <button
                      onClick={handleAddProduct}
                      className="flex items-center gap-1 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
                    >
                      <Plus size={14} />
                      상품 추가
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {targetProducts.map((prod) => (
                      <span
                        key={prod}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-blue-200 rounded-xl text-xs shadow-2xs"
                      >
                        <span className="font-semibold text-blue-700">{prod}</span>
                        <button
                          onClick={() => handleRemoveProduct(prod)}
                          className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filter Bar (Row 1: 필터 영역) */}
          <div className="p-3.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              {/* 검색어 */}
              <div className="relative min-w-[200px] max-w-xs">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="계약번호, 회원명, 핸드폰, 상품명, 송장번호..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8.5 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 transition-all"
                />
              </div>

              {/* O열 요청일자 1클릭 탭 필터 */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => setRequestDateFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    requestDateFilter === 'all' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  전체 요청일
                </button>
                <button
                  type="button"
                  onClick={() => setRequestDateFilter('has_value')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    requestDateFilter === 'has_value' ? 'bg-blue-600 text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  요청일자 있음 ({extractedOrders.filter((o) => !!o.requestDate?.trim()).length})
                </button>
                <button
                  type="button"
                  onClick={() => setRequestDateFilter('no_value')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    requestDateFilter === 'no_value' ? 'bg-slate-700 text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  요청일자 없음 ({extractedOrders.filter((o) => !o.requestDate?.trim()).length})
                </button>
              </div>

              {/* 렌탈상품 다중 선택 드롭다운 */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    selectedProducts.size > 0
                      ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-2xs font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Package size={14} className={selectedProducts.size > 0 ? 'text-blue-600' : 'text-slate-500'} />
                  {selectedProducts.size === 0
                    ? '전체 렌탈상품'
                    : selectedProducts.size === 1
                    ? Array.from(selectedProducts)[0]
                    : `렌탈상품 ${selectedProducts.size}개 선택됨`}
                  <ChevronDown size={14} className="text-slate-400" />
                </button>

                {isProductDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2.5 text-xs">
                    <div className="flex items-center justify-between px-1 py-1 border-b border-slate-100 mb-1.5">
                      <span className="font-bold text-slate-800">렌탈상품 선택 (중복가능)</span>
                      {selectedProducts.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedProducts(new Set())}
                          className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
                        >
                          선택 해제
                        </button>
                      )}
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                      {availableProductOptions.map((p) => {
                        const isChecked = selectedProducts.has(p);
                        return (
                          <label
                            key={p}
                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-slate-800 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedProducts((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(p)) next.delete(p);
                                  else next.add(p);
                                  return next;
                                });
                              }}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="truncate font-medium">{p}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 배송상태 탭 필터 */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => setStateFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    stateFilter === 'all' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  전체 ({ordersFilteredByReqDate.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStateFilter('발주대기')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    stateFilter === '발주대기' ? 'bg-amber-500 text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  발주대기 ({ordersFilteredByReqDate.filter((o) => getRowDeliveryState(o) === '발주대기').length})
                </button>
                <button
                  type="button"
                  onClick={() => setStateFilter('발주완료')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    stateFilter === '발주완료' ? 'bg-purple-600 text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  발주완료 ({ordersFilteredByReqDate.filter((o) => getRowDeliveryState(o) === '발주완료').length})
                </button>
                <button
                  type="button"
                  onClick={() => setStateFilter('배송중')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    stateFilter === '배송중' ? 'bg-blue-600 text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  배송중 ({ordersFilteredByReqDate.filter((o) => getRowDeliveryState(o) === '배송중').length})
                </button>
                <button
                  type="button"
                  onClick={() => setStateFilter('배송완료')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    stateFilter === '배송완료' ? 'bg-emerald-600 text-white shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  배송완료 ({ordersFilteredByReqDate.filter((o) => getRowDeliveryState(o) === '배송완료').length})
                </button>
              </div>
            </div>
          </div>

          {/* Action Bar (Row 2: 일괄 작업 및 액션 버튼) */}
          <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {/* 선택항목 배송상태 일괄 변경 */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
                <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                  선택항목({selectedKeys.size}건) 상태 일괄변경:
                </span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBulkStateChange(e.target.value as DeliveryState);
                      e.target.value = '';
                    }
                  }}
                  disabled={selectedKeys.size === 0}
                  className={`text-xs font-bold rounded-lg px-2.5 py-1 transition-all cursor-pointer border focus:outline-hidden ${
                    selectedKeys.size > 0
                      ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-2xs'
                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  }`}
                >
                  <option value="" disabled>
                    상태 선택...
                  </option>
                  <option value="발주대기" className="bg-white text-slate-800 font-medium">
                    발주대기
                  </option>
                  <option value="발주완료" className="bg-white text-slate-800 font-medium">
                    발주완료
                  </option>
                  <option value="배송중" className="bg-white text-slate-800 font-medium">
                    배송중
                  </option>
                  <option value="배송완료" className="bg-white text-slate-800 font-medium">
                    배송완료
                  </option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* 발주하기 버튼 (기존 4개 필드 발주서 모달) */}
              <button
                type="button"
                onClick={handleOpenOrderModal}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer ${
                  selectedKeys.size > 0
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-indigo-500/25 ring-2 ring-indigo-200'
                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                }`}
              >
                <FileSpreadsheet size={15} />
                발주하기 ({selectedKeys.size}건 선택)
              </button>

              {/* 에넥스 업로드 파일 버튼 */}
              <button
                type="button"
                onClick={handleDownloadEnexExcel}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer ring-2 ring-emerald-200 shadow-emerald-500/25"
              >
                <Download size={15} />
                에넥스 업로드 파일
              </button>

              <button
                type="button"
                onClick={handleExportMainExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 transition-all cursor-pointer shadow-2xs"
              >
                <Download size={14} />
                목록 엑셀
              </button>

              {/* 저장하기 버튼 */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleSaveChanges();
                }}
                disabled={saving || !isChanged}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer ${
                  isChanged
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25 animate-pulse'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                }`}
              >
                <Save size={15} />
                {saving ? '저장 중...' : '저장하기'}
              </button>
            </div>
          </div>

          {/* Notification Alert */}
          {notification && (
            <div
              className={`px-5 py-3 text-xs font-semibold flex items-center justify-between border-b ${
                notification.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 size={16} className={notification.type === 'success' ? 'text-emerald-600' : 'text-rose-600'} />
                {notification.message}
              </span>
              <button onClick={() => setNotification(null)} className="opacity-70 hover:opacity-100 cursor-pointer">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Table Area */}
          <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-slate-50/50">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400">
                <RefreshCw size={28} className="animate-spin text-blue-600" />
                <p className="text-xs font-medium text-slate-500">수기발주 데이터를 로딩하는 중입니다...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                <Package size={40} className="text-slate-300" />
                <p className="text-sm font-semibold text-slate-600">추출된 수기발주 계약이 없습니다.</p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/90 text-slate-700 sticky top-0 backdrop-blur-md z-10 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center border-r border-slate-200">
                        <button
                          onClick={handleToggleSelectAll}
                          className="text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
                        >
                          {isAllSelected ? (
                            <CheckSquare size={16} className="text-blue-600" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-3 w-12 text-center border-r border-slate-200">No</th>
                      <th className="py-3 px-3 w-28 border-r border-slate-200 text-slate-800 bg-slate-200/50 text-center">
                        계약일자
                      </th>
                      <th className="py-3 px-3 w-28 border-r border-slate-200 text-blue-800 bg-blue-50/60 text-center">
                        요청일자
                      </th>
                      <th className="py-3 px-3 w-32 border-r border-slate-200 text-blue-800 bg-blue-50/60 font-mono">
                        계약번호
                      </th>
                      <th className="py-3 px-3 w-28 border-r border-slate-200 text-blue-800 bg-blue-50/60">
                        회원명
                      </th>
                      <th className="py-3 px-3 w-32 border-r border-slate-200 text-blue-800 bg-blue-50/60 font-mono">
                        핸드폰
                      </th>
                      <th className="py-3 px-3 min-w-[180px] border-r border-slate-200 text-blue-800 bg-blue-50/60">
                        렌탈상품명
                      </th>
                      <th className="py-3 px-3 w-28 text-center border-r border-slate-200">
                        배송상태
                      </th>
                      <th className="py-3 px-3 w-36 text-purple-900 bg-purple-50/60 border-r border-slate-200 text-center">
                        발주일
                      </th>
                      <th className="py-3 px-3 w-36 text-amber-800 bg-amber-50/60 border-r border-slate-200">
                        배송일 / 설치일
                      </th>
                      <th className="py-3 px-3 w-36 text-amber-800 bg-amber-50/60 border-r border-slate-200">
                        택배사
                      </th>
                      <th className="py-3 px-3 w-40 text-amber-800 bg-amber-50/60 border-r border-slate-200">
                        송장번호
                      </th>
                      <th className="py-3 px-3 w-20 text-center text-slate-700 bg-slate-100">조회</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredOrders.map((order, idx) => {
                      const isSelected = selectedKeys.has(order.uniqueKey);
                      const isRowEdited = !!editedValues[order.contractNo] || !!editedStates[order.contractNo];
                      const ordDate = getFieldValue(order, 'orderDate');
                      const delDate = getFieldValue(order, 'deliveryDate');
                      const rawCourier = getFieldValue(order, 'courier');
                      const courier = normalizeCourierName(rawCourier);
                      const tracking = getFieldValue(order, 'trackingNo');
                      const hasTracking = !!(courier.trim() && tracking.trim());

                      const currentState = getRowDeliveryState(order);

                      return (
                        <tr
                          key={order.uniqueKey}
                          className={`transition-colors hover:bg-slate-50 ${
                            isSelected ? 'bg-blue-50/60' : isRowEdited ? 'bg-amber-50/30' : idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-2.5 px-3 text-center border-r border-slate-200">
                            <button
                              onClick={() => handleToggleSelect(order.uniqueKey)}
                              className="text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                            >
                              {isSelected ? (
                                <CheckSquare size={16} className="text-blue-600" />
                              ) : (
                                <Square size={16} />
                              )}
                            </button>
                          </td>

                          {/* No */}
                          <td className="py-2.5 px-3 text-center text-slate-400 border-r border-slate-200 font-mono text-[11px]">
                            {idx + 1}
                          </td>

                          {/* 계약일자 */}
                          <td className="py-2.5 px-3 text-center text-slate-700 border-r border-slate-200 font-mono text-[11px] font-medium">
                            {order.contractDate || '-'}
                          </td>

                          {/* 요청일자 */}
                          <td className="py-2.5 px-3 text-center text-blue-900 border-r border-slate-200 font-mono text-[11px] font-semibold bg-blue-50/20">
                            {order.requestDate || '-'}
                          </td>

                          {/* 계약번호 (원클릭 복사 기능) */}
                          <td className="py-2.5 px-3 font-semibold text-blue-950 border-r border-slate-200 font-mono text-xs">
                            <button
                              type="button"
                              onClick={() => handleCopyContractNo(order.contractNo)}
                              className="inline-flex items-center gap-1.5 hover:text-blue-600 hover:underline cursor-pointer group transition-colors"
                              title="클릭하여 계약번호 복사"
                            >
                              <span>{order.contractNo}</span>
                              <Copy size={13} className="text-slate-400 group-hover:text-blue-600 opacity-60 group-hover:opacity-100 transition-opacity" />
                            </button>
                          </td>

                          {/* 회원명 */}
                          <td className="py-2.5 px-3 border-r border-slate-200 font-bold text-slate-900">
                            {order.memName || '-'}
                          </td>

                          {/* 핸드폰 */}
                          <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-slate-700">
                            {order.phone || '-'}
                          </td>

                          {/* 렌탈상품명 */}
                          <td className="py-2.5 px-3 border-r border-slate-200 font-semibold text-slate-800">
                            {order.rentalProdClean}
                          </td>

                          {/* 배송상태 선택 (드롭다운) */}
                          <td className="py-2.5 px-3 text-center border-r border-slate-200">
                            <select
                              value={currentState}
                              onChange={(e) => handleStateChange(order.contractNo, e.target.value as DeliveryState)}
                              className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border focus:outline-hidden ${
                                currentState === '배송완료'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                  : currentState === '배송중'
                                  ? 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
                                  : currentState === '발주완료'
                                  ? 'bg-purple-100 text-purple-900 border-purple-300 hover:bg-purple-200'
                                  : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                              }`}
                            >
                              <option value="발주대기" className="bg-white text-slate-800 font-medium">
                                발주대기
                              </option>
                              <option value="발주완료" className="bg-white text-slate-800 font-medium">
                                발주완료
                              </option>
                              <option value="배송중" className="bg-white text-slate-800 font-medium">
                                배송중
                              </option>
                              <option value="배송완료" className="bg-white text-slate-800 font-medium">
                                배송완료
                              </option>
                            </select>
                          </td>

                          {/* 발주일 (신규 추가) */}
                          <td className="py-2 px-3 border-r border-slate-200 bg-purple-50/10">
                            <input
                              type="date"
                              value={ordDate}
                              onChange={(e) => handleInputChange(order.contractNo, 'orderDate', e.target.value)}
                              className={`w-full px-2 py-1 bg-white border rounded-lg text-xs font-mono transition-all ${
                                editedValues[order.contractNo]?.orderDate !== undefined &&
                                editedValues[order.contractNo]?.orderDate !== order.orderDate
                                  ? 'border-purple-500 text-purple-700 ring-2 ring-purple-100 font-bold'
                                  : 'border-slate-300 text-slate-800 focus:border-purple-500'
                              }`}
                            />
                          </td>

                          {/* 배송일 / 설치일 */}
                          <td className="py-2 px-3 border-r border-slate-200 bg-amber-50/10">
                            <input
                              type="date"
                              value={delDate}
                              onChange={(e) => handleInputChange(order.contractNo, 'deliveryDate', e.target.value)}
                              className={`w-full px-2 py-1 bg-white border rounded-lg text-xs font-mono transition-all ${
                                editedValues[order.contractNo]?.deliveryDate !== undefined &&
                                editedValues[order.contractNo]?.deliveryDate !== order.deliveryDate
                                  ? 'border-blue-500 text-blue-700 ring-2 ring-blue-100 font-bold'
                                  : 'border-slate-300 text-slate-800 focus:border-amber-500'
                              }`}
                            />
                          </td>

                          {/* 택배사 */}
                          <td className="py-2 px-3 border-r border-slate-200 bg-amber-50/10">
                            <div className="flex flex-col gap-1">
                              <select
                                value={COURIER_OPTIONS.includes(courier) ? courier : courier ? 'custom' : ''}
                                onChange={(e) => {
                                  if (e.target.value === 'custom') {
                                    handleInputChange(order.contractNo, 'courier', courier && !COURIER_OPTIONS.includes(courier) ? courier : ' ');
                                  } else {
                                    handleInputChange(order.contractNo, 'courier', e.target.value);
                                  }
                                }}
                                className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:border-amber-500"
                              >
                                <option value="">택배사 선택</option>
                                {COURIER_OPTIONS.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                                <option value="custom">직접입력...</option>
                              </select>
                              {(!COURIER_OPTIONS.includes(courier) && courier !== '') && (
                                <input
                                  type="text"
                                  placeholder="택배사 직접 입력"
                                  value={courier.trim()}
                                  onChange={(e) => handleInputChange(order.contractNo, 'courier', e.target.value)}
                                  className="w-full px-2 py-0.5 bg-white border border-slate-300 rounded-md text-xs text-slate-800"
                                />
                              )}
                            </div>
                          </td>

                          {/* 송장번호 */}
                          <td className="py-2 px-3 border-r border-slate-200 bg-amber-50/10">
                            <input
                              type="text"
                              placeholder="송장번호 입력"
                              value={tracking}
                              onChange={(e) => handleInputChange(order.contractNo, 'trackingNo', e.target.value)}
                              className={`w-full px-2.5 py-1 bg-white border rounded-lg text-xs font-mono transition-all ${
                                editedValues[order.contractNo]?.trackingNo !== undefined &&
                                editedValues[order.contractNo]?.trackingNo !== order.trackingNo
                                  ? 'border-blue-500 text-blue-700 ring-2 ring-blue-100 font-bold'
                                  : 'border-slate-300 text-slate-800 focus:border-amber-500'
                              }`}
                            />
                          </td>

                          {/* 조회 버튼 */}
                          <td className="py-2 px-2 text-center">
                            <button
                              onClick={() => handleOpenTracking(courier, tracking)}
                              disabled={!hasTracking}
                              className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                hasTracking
                                  ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 shadow-2xs'
                                  : 'bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed'
                              }`}
                            >
                              조회
                              <ExternalLink size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className="px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-600">
            <div className="flex items-center gap-4">
              <span>
                체크 선택: <strong className="text-blue-700 font-mono font-bold">{selectedKeys.size}</strong> / {filteredOrders.length}건
              </span>
              <span>
                발주대기: <strong className="text-amber-600 font-mono font-bold">{extractedOrders.filter((o) => getRowDeliveryState(o) === '발주대기').length}</strong>건
              </span>
              <span>
                발주완료: <strong className="text-purple-700 font-mono font-bold">{extractedOrders.filter((o) => getRowDeliveryState(o) === '발주완료').length}</strong>건
              </span>
              <span>
                배송중: <strong className="text-blue-600 font-mono font-bold">{extractedOrders.filter((o) => getRowDeliveryState(o) === '배송중').length}</strong>건
              </span>
              <span>
                배송완료: <strong className="text-emerald-600 font-mono font-bold">{extractedOrders.filter((o) => getRowDeliveryState(o) === '배송완료').length}</strong>건
              </span>
            </div>

            {isChanged && (
              <span className="text-blue-600 font-bold animate-pulse">
                * 수정된 정보/배송상태가 있습니다. 오른쪽 상단 [저장하기] 버튼을 누르세요.
              </span>
            )}
          </div>
        </motion.div>

        {/* 발주하기 엑셀 모달 */}
        {isOrderModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[1100px] max-h-[85vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                  <h3 className="text-lg font-bold text-slate-900">발주서 엑셀 생성 및 미리보기</h3>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                    선택된 {selectedOrdersList.length}건
                  </span>
                </div>
                <button
                  onClick={() => setIsOrderModalOpen(false)}
                  className="w-8 h-8 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Action Bar */}
              <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">
                  * 선택된 {selectedOrdersList.length}건이 아래 4개 필드(받는분, 연락처, 받는분주소, 상품명) 양식으로 엑셀 다운로드됩니다.
                </span>

                <button
                  onClick={handleDownloadOrderExcel}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all"
                >
                  <Download size={16} />
                  발주서 엑셀 다운로드
                </button>
              </div>

              {/* Preview Table */}
              <div className="flex-1 overflow-auto p-4 custom-scrollbar bg-slate-100/60">
                <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 border-r border-slate-200 w-12 text-center text-slate-400">NO</th>
                        <th className="py-3 px-4 border-r border-slate-200 text-blue-900 font-bold w-36">받는분</th>
                        <th className="py-3 px-4 border-r border-slate-200 font-mono w-40">연락처</th>
                        <th className="py-3 px-4 border-r border-slate-200 min-w-[280px]">받는분주소</th>
                        <th className="py-3 px-4 font-bold text-slate-900 min-w-[200px]">상품명</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {selectedOrdersList.map((o, idx) => (
                        <tr key={o.uniqueKey} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 border-r border-slate-200 text-center font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-2.5 px-4 border-r border-slate-200 font-bold text-slate-900">{o.memName}</td>
                          <td className="py-2.5 px-4 border-r border-slate-200 font-mono text-slate-700">{formatPhoneNum(o.phone)}</td>
                          <td className="py-2.5 px-4 border-r border-slate-200 text-slate-700">{o.address || '-'}</td>
                          <td className="py-2.5 px-4 font-semibold text-blue-900">{o.rentalProdClean}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </AnimatePresence>
  );
};
