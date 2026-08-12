import React, { useState, useMemo, useEffect } from 'react';
import { X, Search, Save, Download, RefreshCw, Truck, Package, CheckCircle2, Plus, Trash2, Settings, ChevronDown, ChevronUp, ExternalLink, CheckSquare, Square, FileSpreadsheet, Calendar, Filter } from 'lucide-react';
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

export type DeliveryState = '발주대기' | '배송중' | '배송완료';

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
    return `https://kdexp.com/service/delivery/delivery_result.do?barcode=${cleanTracking}`;
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

  // 수기발주 대상 상품 목록
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

  // 수기발주 시트 원본 rows
  const [sheetOrderRows, setSheetOrderRows] = useState<any[]>([]);

  // 원본 수기발주 시트 변동과 독립적인 독자 영구 저장소 { [contractNo]: { deliveryDate, courier, trackingNo, deliveryState } }
  const [savedOrderStore, setSavedOrderStore] = useState<Record<string, { deliveryDate?: string; courier?: string; trackingNo?: string; deliveryState?: DeliveryState }>>(() => {
    try {
      const saved = localStorage.getItem('erp_manual_orders_saved_store_v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  // 편집된 값 상태 { [contractNo]: { deliveryDate, courier, trackingNo } }
  const [editedValues, setEditedValues] = useState<Record<string, { deliveryDate?: string; courier?: string; trackingNo?: string }>>({});

  // 원클릭 변경된 배송상태 { [contractNo]: DeliveryState }
  const [editedStates, setEditedStates] = useState<Record<string, DeliveryState>>({});

  // 다중 선택 상태 (체크된 uniqueKey Set)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  // 필터 상태
  const [searchTerm, setSearchTerm] = useState('');
  const [requestDateFilter, setRequestDateFilter] = useState<string>('all'); // 수기발주 O열 요청일 필터
  const [productFilter, setProductFilter] = useState<string>('all'); // 렌탈상품 필터
  const [stateFilter, setStateFilter] = useState<'all' | DeliveryState>('all'); // 배송상태 필터
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 발주서 엑셀 팝업 모달 상태
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(targetProducts));
    } catch (e) {
      console.error('Failed to save target products', e);
    }
  }, [targetProducts]);

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

  // 수기발주 시트 데이터 로드
  const fetchOrderSheetData = async () => {
    setLoading(true);
    setNotification(null);
    try {
      const timestamp = Date.now();
      const res = await fetch(`/api/sheets/sheetData?sheetName=${encodeURIComponent('수기발주')}&t=${timestamp}`);
      if (res.ok) {
        const rows = await res.json();
        setSheetOrderRows(rows || []);
      } else {
        setSheetOrderRows([]);
      }
    } catch (err: any) {
      console.warn('수기발주 시트 로드 실패:', err);
      setSheetOrderRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchOrderSheetData();
      setEditedValues({});
      setEditedStates({});
      setSelectedKeys(new Set());
    }
  }, [isOpen]);

  // 수기발주 시트 B열 계약번호 Map (O열 요청일: index 14, L열 주소: index 11)
  const sheetOrderMap = useMemo(() => {
    const map = new Map<string, { rowIdx: number; deliveryDate: string; courier: string; trackingNo: string; address: string; zipCode: string; requestDate: string; raw: any[] }>();
    if (Array.isArray(sheetOrderRows) && sheetOrderRows.length > 1) {
      sheetOrderRows.slice(1).forEach((row, idx) => {
        const contractNo = String(row[1] || '').trim().toUpperCase(); // B열
        if (contractNo) {
          map.set(contractNo, {
            rowIdx: idx + 2,
            deliveryDate: String(row[20] || '').trim(), // U열 (20)
            courier: normalizeCourierName(String(row[21] || '').trim()), // V열 (21)
            trackingNo: String(row[22] || '').trim(), // W열 (22)
            address: String(row[11] || '').trim(), // L열 주소 (11)
            zipCode: String(row[10] || '').trim(), // K열 우편번호 (10)
            requestDate: String(row[14] || '').trim(), // O열 요청일 (14)
            raw: row,
          });
        }
      });
    }
    return map;
  }, [sheetOrderRows]);

  // 추출된 계약건 목록
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
      if (!isTarget) return;

      // 가입상태가 '가입'인 건만 추출 (취소, 해약 등 제외)
      const itemStatus = String(item.status || '').trim();
      if (itemStatus !== '가입') return;

      const contractNo = (item.rentalNo || item.memNo || '').trim();
      if (!contractNo) return;

      const contractKey = contractNo.toUpperCase();
      if (seenContracts.has(contractKey)) return;
      seenContracts.add(contractKey);

      const sheetMatch = sheetOrderMap.get(contractKey);

      const savedData = savedOrderStore[contractKey] || savedOrderStore[contractNo];

      const delDate = savedData?.deliveryDate !== undefined ? savedData.deliveryDate : (sheetMatch?.deliveryDate || item.deliveryDate || '');
      const rawCourier = savedData?.courier !== undefined ? savedData.courier : (sheetMatch?.courier || '');
      const courier = normalizeCourierName(rawCourier);
      const tracking = savedData?.trackingNo !== undefined ? savedData.trackingNo : (sheetMatch?.trackingNo || '');

      // 기본 배송상태 구별 (독자 저장소 > 수기발주 X열(23) > 상태 및 날짜 판별)
      let dState: DeliveryState = '발주대기';
      if (savedData?.deliveryState) {
        dState = savedData.deliveryState;
      } else {
        const sheetSavedState = String(sheetMatch?.raw?.[23] || '').trim() as DeliveryState;
        if (['발주대기', '배송중', '배송완료'].includes(sheetSavedState)) {
          dState = sheetSavedState;
        } else if (item.deliveryStatus && item.deliveryStatus.includes('완료')) {
          dState = '배송완료';
        } else if (delDate || tracking || courier) {
          dState = '배송중';
        }
      }

      list.push({
        uniqueKey: item.uniqueKey || `item-${contractNo}`,
        rowIdx: sheetMatch?.rowIdx,
        contractNo,
        contractDate: item.contractDate || '',
        requestDate: sheetMatch?.requestDate || '',
        memName: item.memName || '',
        phone: item.phone || '',
        rentalProdRaw: rawProdName,
        rentalProdClean: cleanProdName,
        status: item.status || '가입',
        address: sheetMatch?.address || '',
        zipCode: sheetMatch?.zipCode || '',
        deliveryDate: delDate,
        courier,
        trackingNo: tracking,
        deliveryState: dState,
        rawOrderRow: sheetMatch?.raw,
      });
    });

    return list;
  }, [data, targetProducts, sheetOrderMap, savedOrderStore]);

  // 수기발주 시트 O열 요청일 목록 옵션
  const availableRequestDateOptions = useMemo(() => {
    const dates = new Set<string>();
    extractedOrders.forEach((o) => {
      if (o.requestDate) dates.add(o.requestDate);
    });
    return Array.from(dates).sort().reverse();
  }, [extractedOrders]);

  // 렌탈상품 목록 옵션
  const availableProductOptions = useMemo(() => {
    const prods = new Set<string>();
    extractedOrders.forEach((o) => prods.add(o.rentalProdClean));
    return Array.from(prods).sort();
  }, [extractedOrders]);

  // 배송상태 원클릭 토글 함수: 발주대기 -> 배송중 -> 배송완료 -> 발주대기
  const handleCycleState = (contractNo: string, currentDefaultState: DeliveryState) => {
    const cur = editedStates[contractNo] || currentDefaultState;
    let next: DeliveryState = '발주대기';
    if (cur === '발주대기') next = '배송중';
    else if (cur === '배송중') next = '배송완료';
    else if (cur === '배송완료') next = '발주대기';

    setEditedStates((prev) => ({
      ...prev,
      [contractNo]: next,
    }));
  };

  const handleInputChange = (contractNo: string, field: 'deliveryDate' | 'courier' | 'trackingNo', value: string) => {
    setEditedValues((prev) => ({
      ...prev,
      [contractNo]: {
        ...prev[contractNo],
        [field]: value,
      },
    }));
  };

  const getFieldValue = (row: OrderRow, field: 'deliveryDate' | 'courier' | 'trackingNo') => {
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

  // 검색 및 요청일(O열), 상품명, 상태 필터링
  const filteredOrders = useMemo(() => {
    return extractedOrders.filter((order) => {
      const currentState = getRowDeliveryState(order);

      if (requestDateFilter !== 'all' && order.requestDate !== requestDateFilter) return false;
      if (stateFilter !== 'all' && currentState !== stateFilter) return false;
      if (productFilter !== 'all' && order.rentalProdClean !== productFilter) return false;

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
  }, [extractedOrders, editedValues, editedStates, requestDateFilter, stateFilter, productFilter, searchTerm]);

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

        let newDelDate = editedVal?.deliveryDate !== undefined ? editedVal.deliveryDate : (existing.deliveryDate ?? row.deliveryDate ?? '');
        let newCourier = editedVal?.courier !== undefined ? normalizeCourierName(editedVal.courier.trim()) : (existing.courier ?? row.courier ?? '');
        let newTracking = editedVal?.trackingNo !== undefined ? editedVal.trackingNo.trim() : (existing.trackingNo ?? row.trackingNo ?? '');
        let newDState = editedSt !== undefined ? editedSt : (existing.deliveryState ?? row.deliveryState ?? '발주대기');

        // 배송 정보(배송일, 택배사, 송장번호)가 채워져 있는데 상태가 발주대기면 자동으로 '배송중'으로 업그레이드
        if (newDState === '발주대기' && (newDelDate.trim() || newCourier.trim() || newTracking.trim())) {
          newDState = '배송중';
        }

        nextStore[cKey] = {
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
        message: `성공적으로 ${allEditedContractNos.size}건의 배송정보 및 배송상태가 구글 시트와 저장소에 저장되었습니다! 잠시 후 화면이 새로고침됩니다.`,
        type: 'success',
      });

      setEditedValues({});
      setEditedStates({});

      // 4. 저장 완료 후 화면 자동 새로고침
      setTimeout(() => {
        window.location.reload();
      }, 500);
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

  // 4개 필수 필드 발주서 엑셀 다운로드 (받는분, 연락처, 받는분주소, 상품명)
  const handleDownloadOrderExcel = () => {
    if (!XLSX) {
      alert('XLSX 라이브러리를 로드하지 못했습니다.');
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const headers = ['받는분', '연락처', '받는분주소', '상품명'];
    const rows = selectedOrdersList.map((o) => [
      o.memName,
      o.phone,
      o.address,
      o.rentalProdClean,
    ]);

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '발주서');
    XLSX.writeFile(wb, `발주서_${todayStr}.xlsx`);
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-3 md:p-6 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 10 }}
          className="bg-white border border-slate-200 text-slate-800 w-full max-w-[1500px] h-[93vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
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

          {/* Filter Bar */}
          <div className="p-4 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-[360px]">
              {/* 검색어 */}
              <div className="relative flex-1 max-w-xs">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="계약번호, 회원명, 핸드폰, 상품명, 송장번호..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 transition-all"
                />
              </div>

              {/* O열 요청일자 필터 */}
              <div className="flex items-center gap-1 bg-slate-50 px-3 py-1.5 border border-slate-200 rounded-xl">
                <Calendar size={14} className="text-blue-600" />
                <span className="text-xs font-bold text-slate-700 whitespace-nowrap">요청일자:</span>
                <select
                  value={requestDateFilter}
                  onChange={(e) => setRequestDateFilter(e.target.value)}
                  className="bg-transparent text-xs font-bold text-blue-700 focus:outline-hidden cursor-pointer"
                >
                  <option value="all">전체 요청일자</option>
                  {availableRequestDateOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* 렌탈상품 선택 필터 */}
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:border-blue-500"
              >
                <option value="all">전체 렌탈상품</option>
                {availableProductOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              {/* 배송상태 탭 필터 */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                <button
                  onClick={() => setStateFilter('all')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    stateFilter === 'all' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  전체 ({extractedOrders.length})
                </button>
                <button
                  onClick={() => setStateFilter('발주대기')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    stateFilter === '발주대기' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  발주대기 ({extractedOrders.filter((o) => getRowDeliveryState(o) === '발주대기').length})
                </button>
                <button
                  onClick={() => setStateFilter('배송중')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    stateFilter === '배송중' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  배송중 ({extractedOrders.filter((o) => getRowDeliveryState(o) === '배송중').length})
                </button>
                <button
                  onClick={() => setStateFilter('배송완료')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    stateFilter === '배송완료' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  배송완료 ({extractedOrders.filter((o) => getRowDeliveryState(o) === '배송완료').length})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* 발주하기 버튼 */}
              <button
                type="button"
                onClick={handleOpenOrderModal}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer ${
                  selectedKeys.size > 0
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-indigo-500/25 ring-2 ring-indigo-200'
                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                }`}
              >
                <FileSpreadsheet size={15} />
                발주하기 ({selectedKeys.size}건 선택)
              </button>

              <button
                type="button"
                onClick={handleExportMainExcel}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-xl border border-emerald-200 transition-all cursor-pointer shadow-2xs"
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
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer ${
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
                {requestDateFilter !== 'all' && (
                  <p className="text-xs text-blue-600 font-medium">
                    선택된 요청일자({requestDateFilter})에 해당하는 건이 없습니다.
                  </p>
                )}
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
                        요청일자 (O열)
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

                          {/* 요청일자 (O열) */}
                          <td className="py-2.5 px-3 text-center text-blue-900 border-r border-slate-200 font-mono text-[11px] font-semibold bg-blue-50/20">
                            {order.requestDate || '-'}
                          </td>

                          {/* 계약번호 */}
                          <td className="py-2.5 px-3 font-semibold text-blue-950 border-r border-slate-200 font-mono text-xs">
                            {order.contractNo}
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

                          {/* 원클릭 배송상태 버튼 */}
                          <td className="py-2.5 px-3 text-center border-r border-slate-200">
                            <button
                              onClick={() => handleCycleState(order.contractNo, order.deliveryState)}
                              className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer hover:scale-105 shadow-2xs border ${
                                currentState === '배송완료'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                  : currentState === '배송중'
                                  ? 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200'
                                  : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                              }`}
                              title="클릭 시 [발주대기 -> 배송중 -> 배송완료] 상태가 순환 변경됩니다."
                            >
                              {currentState}
                            </button>
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
                          <td className="py-2.5 px-4 border-r border-slate-200 font-mono text-slate-700">{o.phone}</td>
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
