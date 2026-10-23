import React, { useState, useMemo } from 'react';
import { 
  X, Download, Printer, Building, CreditCard, Receipt, 
  Package, Search, FileText, CheckCircle, ExternalLink, Calendar, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { autoFitColWidths, applyTableExcelStyle } from './excelStyleUtils';

// @ts-ignore
const XLSX = (window as any).XLSX;

export interface SettlementDetailItem {
  uniqueKey: string;
  rentalNo: string;
  contractDate: string;
  memName: string;
  phone?: string;
  prodName: string;
  rentalProdRaw?: string;
  matchedSupplierId: string;
  matchedSupplierName: string;
  matchedProductId: string;
  matchedProductName: string;
  quantity: number;
  supplyCommission: number;
  totalCommission: number;
  commissionRecipient: string;
  recipientBank?: string;
  recipientAccount?: string;
  recipientHolder?: string;
  deliveryDate: string;
  deliveryStatus: string;
  installCertStatus: '등록' | '미등록';
  installCertDate?: string;
  installCertMonth?: string;
  payoutDate: string;
  payoutMonth: string;
  isCommissionPayable: boolean;
  hq: string;
  branch: string;
  empName: string;
}

export interface CommissionDetailTarget {
  recipientKey: string;
  supplierId: string;
  supplierName: string;
  commissionRecipient: string;
  recipientBank: string;
  recipientAccount: string;
  recipientHolder: string;
  productCount: number;
  totalCommissionAmount: number;
  items: SettlementDetailItem[];
}

interface CommissionSettlementDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: CommissionDetailTarget | null;
  // 동일 수령처의 모든 관련 공급사 아이템 (수령처 전체 통합 뷰 지원)
  allRecipientItems?: SettlementDetailItem[];
  selectedMonth: string;
}

// 한글 금액 변환 함수 (예: 7,500,000 -> 칠백오십만)
export function numberToKorean(num: number): string {
  if (!num || isNaN(num) || num <= 0) return '영';
  const units = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const smallUnits = ['', '십', '백', '천'];
  const bigUnits = ['', '만', '억', '조'];
  
  let result = '';
  let unitIndex = 0;
  let temp = Math.floor(num);
  
  while (temp > 0) {
    const chunk = temp % 10000;
    if (chunk > 0) {
      let chunkStr = '';
      let cTemp = chunk;
      for (let i = 0; i < 4; i++) {
        const digit = cTemp % 10;
        if (digit > 0) {
          const digitStr = (i > 0 && digit === 1) ? '' : units[digit];
          chunkStr = digitStr + smallUnits[i] + chunkStr;
        }
        cTemp = Math.floor(cTemp / 10);
      }
      result = chunkStr + (bigUnits[unitIndex] || '') + ' ' + result;
    }
    temp = Math.floor(temp / 10000);
    unitIndex++;
  }
  return result.trim();
}

// 엑셀 명세서 생성 및 다운로드 함수
export function exportCommissionStatementExcel(
  recipientName: string,
  bankName: string,
  accountNo: string,
  holder: string,
  selectedMonth: string,
  targetItems: SettlementDetailItem[],
  supplierFilterName?: string
) {
  if (!XLSX) {
    alert('엑셀 라이브러리를 로드할 수 없습니다.');
    return;
  }

  const wb = XLSX.utils.book_new();

  // 계산
  const totalAmount = targetItems.reduce((acc, cur) => acc + (cur.totalCommission || 0), 0);
  const totalSupply = Math.round(totalAmount / 1.1);
  const totalVat = totalAmount - totalSupply;
  const totalCount = targetItems.reduce((acc, cur) => acc + (cur.quantity || 1), 0);

  // 관련 공급사 목록
  const suppNames = Array.from(new Set(targetItems.map(i => i.matchedSupplierName))).filter(Boolean).join(', ');

  // 상품별 집계
  const prodMap = new Map<string, {
    supplierName: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
  }>();

  targetItems.forEach(item => {
    const prodKey = `${item.matchedSupplierName}_${item.matchedProductName || item.prodName}`;
    const cur = prodMap.get(prodKey) || {
      supplierName: item.matchedSupplierName,
      productName: item.matchedProductName || item.prodName,
      quantity: 0,
      unitPrice: item.supplyCommission || 0,
      totalAmount: 0
    };
    cur.quantity += (item.quantity || 1);
    cur.totalAmount += (item.totalCommission || 0);
    prodMap.set(prodKey, cur);
  });
  const productSummaries = Array.from(prodMap.values());

  const prodTableStartRow = 15;
  const prodDataStartRow = 16;
  const prodDataEndRow = prodDataStartRow + productSummaries.length - 1;
  const prodTotalRowIdx = prodDataEndRow + 1;

  // 1. [정산 명세서 시트]
  const rows: any[][] = [
    [`공급 수수료(특수수당) 정산 명세서 (${selectedMonth})`],
    [`지급 주체: (주)리치웰페어  |  수령처: ${recipientName}  |  관련 공급사(기준): ${supplierFilterName || suppNames || '-'}`],
    [`※ 관련 공급사는 정산 산정 기준 표기이며, (주)리치웰페어에서 수령처 계좌로 직접 지급합니다.`],
    [`출력일시: ${new Date().toLocaleString()}`],
    [],
    ['[1. 정산 지급 계좌 정보]'],
    ['수령처명', '수령 은행', '수령 계좌번호', '예금주', '지급처', '지급 예정일'],
    [recipientName, bankName, accountNo, holder, '(주)리치웰페어', `${selectedMonth} 말일`],
    [],
    ['[2. 세금계산서 발행 내역 (부가세 포함된 금액으로 부가세 및 공급가 표기)]'],
    ['구분', '공급가액', '부가세 (10%)', '합계금액 (세금계산서 총액 / VAT 포함)', '비고 (한글 금액 표기)'],
    [
      '공급 수수료(특수수당)',
      productSummaries.length > 0 ? { f: `F${prodTotalRowIdx}`, v: totalSupply, t: 'n', z: '#,##0' } : { v: totalSupply, t: 'n', z: '#,##0' },
      productSummaries.length > 0 ? { f: `G${prodTotalRowIdx}`, v: totalVat, t: 'n', z: '#,##0' } : { v: totalVat, t: 'n', z: '#,##0' },
      productSummaries.length > 0 ? { f: `H${prodTotalRowIdx}`, v: totalAmount, t: 'n', z: '#,##0' } : { v: totalAmount, t: 'n', z: '#,##0' },
      `일금 ${numberToKorean(totalAmount)} 원정`
    ],
    [],
    ['[3. 상품별 정산 내역]'],
    ['No', '관련 공급사 (기준)', '상품명 (매칭 제품명)', '정산 수량', '수수료 단가 (VAT포함)', '공급가액', '부가세 (10%)', '총 지급수수료 (VAT포함)']
  ];

  productSummaries.forEach((prod, idx) => {
    const r = prodDataStartRow + idx;
    const pSupply = Math.round(prod.totalAmount / 1.1);
    const pVat = prod.totalAmount - pSupply;
    rows.push([
      idx + 1,
      prod.supplierName,
      prod.productName,
      { v: prod.quantity, t: 'n', z: '#,##0' },
      { v: prod.unitPrice, t: 'n', z: '#,##0' },
      { f: `ROUND(H${r}/1.1,0)`, v: pSupply, t: 'n', z: '#,##0' },
      { f: `H${r}-F${r}`, v: pVat, t: 'n', z: '#,##0' },
      { f: `D${r}*E${r}`, v: prod.totalAmount, t: 'n', z: '#,##0' }
    ]);
  });

  rows.push([
    '합계',
    '',
    '',
    productSummaries.length > 0 ? { f: `SUM(D${prodDataStartRow}:D${prodDataEndRow})`, v: totalCount, t: 'n', z: '#,##0' } : 0,
    '',
    productSummaries.length > 0 ? { f: `SUM(F${prodDataStartRow}:F${prodDataEndRow})`, v: totalSupply, t: 'n', z: '#,##0' } : 0,
    productSummaries.length > 0 ? { f: `SUM(G${prodDataStartRow}:G${prodDataEndRow})`, v: totalVat, t: 'n', z: '#,##0' } : 0,
    productSummaries.length > 0 ? { f: `SUM(H${prodDataStartRow}:H${prodDataEndRow})`, v: totalAmount, t: 'n', z: '#,##0' } : 0
  ]);

  rows.push([]);
  rows.push(['[4. 건별 상세 내역]']);
  rows.push([
    'No',
    '렌탈계약번호',
    '계약일자',
    '배송완료일',
    '관련 공급사 (기준)',
    '상품명 (제품명)',
    '고객명',
    '소속 본부',
    '지사',
    '영업사원',
    '수수료 단가 (VAT포함)',
    '지급 수수료 (VAT포함)'
  ]);

  const detailStartRow = prodTotalRowIdx + 4;
  const detailEndRow = detailStartRow + targetItems.length - 1;

  targetItems.forEach((item, idx) => {
    rows.push([
      idx + 1,
      item.rentalNo,
      item.contractDate || '-',
      item.deliveryDate || '-',
      item.matchedSupplierName,
      item.matchedProductName || item.prodName || '-',
      item.memName,
      item.hq || '-',
      item.branch || '-',
      item.empName || '-',
      { v: item.supplyCommission || 0, t: 'n', z: '#,##0' },
      { v: item.totalCommission || 0, t: 'n', z: '#,##0' }
    ]);
  });

  rows.push([
    '총합계',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    `${targetItems.length}건`,
    '',
    targetItems.length > 0 ? { f: `SUM(L${detailStartRow}:L${detailEndRow})`, v: totalAmount, t: 'n', z: '#,##0' } : { v: 0, t: 'n', z: '#,##0' }
  ]);

  rows.push([]);
  rows.push(['위 정산 명세서의 내용과 세금계산서 발행 및 계좌 입금 내역이 일치함을 확인합니다.']);
  rows.push(['발행처: (주)리치웰페어 (직인생략)']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = autoFitColWidths(rows, 10, 42);
  applyTableExcelStyle(ws, 'PURPLE');

  XLSX.utils.book_append_sheet(wb, ws, '정산명세서');

  if (!wb.Workbook) wb.Workbook = {};
  if (!wb.Workbook.CalcPr) wb.Workbook.CalcPr = {};
  wb.Workbook.CalcPr.fullCalcOnLoad = true;

  const filePrefix = supplierFilterName ? `${recipientName}_${supplierFilterName}` : recipientName;
  const fileName = `리치웰페어_수수료명세서_${filePrefix}_${selectedMonth}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export const CommissionSettlementDetailModal: React.FC<CommissionSettlementDetailModalProps> = ({
  isOpen,
  onClose,
  target,
  allRecipientItems = [],
  selectedMonth
}) => {
  // 모달 내부 범위 탭: 'CURRENT_SUPPLIER' (해당 공급사 기준) vs 'ALL_RECIPIENT' (수령처 전체 통합)
  const [scope, setScope] = useState<'CURRENT_SUPPLIER' | 'ALL_RECIPIENT'>('CURRENT_SUPPLIER');
  const [searchTerm, setSearchTerm] = useState('');

  // 1. 수령처 내의 관련 공급사 목록 파악
  const availableSuppliers = useMemo(() => {
    if (!allRecipientItems || allRecipientItems.length === 0) return [];
    const suppMap = new Map<string, { id: string; name: string; count: number; amount: number }>();
    allRecipientItems.forEach(item => {
      const cur = suppMap.get(item.matchedSupplierId) || {
        id: item.matchedSupplierId,
        name: item.matchedSupplierName,
        count: 0,
        amount: 0
      };
      cur.count += (item.quantity || 1);
      cur.amount += (item.totalCommission || 0);
      suppMap.set(item.matchedSupplierId, cur);
    });
    return Array.from(suppMap.values());
  }, [allRecipientItems]);

  const hasMultipleSuppliers = availableSuppliers.length > 1;

  // 2. 현재 선택된 스코프에 따른 대상 데이터
  const activeItems = useMemo<SettlementDetailItem[]>(() => {
    if (!target) return [];
    if (scope === 'ALL_RECIPIENT') {
      return allRecipientItems.length > 0 ? allRecipientItems : target.items;
    }
    // CURRENT_SUPPLIER
    return target.items || [];
  }, [target, allRecipientItems, scope]);

  // 3. 검색 필터 적용된 건별 리스트
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return activeItems;
    const term = searchTerm.trim().toLowerCase();
    return activeItems.filter(item => 
      item.rentalNo.toLowerCase().includes(term) ||
      item.memName.toLowerCase().includes(term) ||
      item.matchedProductName.toLowerCase().includes(term) ||
      (item.matchedSupplierName && item.matchedSupplierName.toLowerCase().includes(term)) ||
      item.hq.toLowerCase().includes(term) ||
      item.empName.toLowerCase().includes(term)
    );
  }, [activeItems, searchTerm]);

  // 4. 총합계 및 세금계산서 발행금액 (부가세 포함된 금액으로 부가세와 공급가 표기)
  const stats = useMemo(() => {
    const totalAmount = activeItems.reduce((acc, cur) => acc + (cur.totalCommission || 0), 0);
    const count = activeItems.reduce((acc, cur) => acc + (cur.quantity || 1), 0);
    const supplyPrice = Math.round(totalAmount / 1.1);
    const vat = totalAmount - supplyPrice;

    return {
      totalAmount,
      count,
      supplyPrice,
      vat,
      koreanAmount: numberToKorean(totalAmount)
    };
  }, [activeItems]);

  // 5. 상품별 집계 내역
  const productSummaries = useMemo(() => {
    const map = new Map<string, {
      supplierName: string;
      productName: string;
      unitPrice: number;
      quantity: number;
      totalAmount: number;
      supplyPrice: number;
      vat: number;
    }>();

    activeItems.forEach(item => {
      const prodKey = `${item.matchedSupplierName}_${item.matchedProductName || item.prodName}`;
      const cur = map.get(prodKey) || {
        supplierName: item.matchedSupplierName,
        productName: item.matchedProductName || item.prodName,
        unitPrice: item.supplyCommission || 0,
        quantity: 0,
        totalAmount: 0,
        supplyPrice: 0,
        vat: 0
      };
      cur.quantity += (item.quantity || 1);
      cur.totalAmount += (item.totalCommission || 0);
      cur.supplyPrice = Math.round(cur.totalAmount / 1.1);
      cur.vat = cur.totalAmount - cur.supplyPrice;
      map.set(prodKey, cur);
    });

    return Array.from(map.values());
  }, [activeItems]);

  if (!isOpen || !target) return null;

  const currentSupplierLabel = scope === 'CURRENT_SUPPLIER' ? target.supplierName : '전체 관련 공급사 통합';

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    exportCommissionStatementExcel(
      target.commissionRecipient,
      target.recipientBank,
      target.recipientAccount,
      target.recipientHolder,
      selectedMonth,
      activeItems,
      scope === 'CURRENT_SUPPLIER' ? target.supplierName : undefined
    );
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="bg-white rounded-2xl shadow-2xl w-[98vw] max-w-[1400px] h-[92vh] max-h-[92vh] flex flex-col overflow-hidden border border-slate-200"
      >
        {/* 모달 상단 헤더 */}
        <div className="px-6 py-4 bg-linear-to-r from-slate-950 via-purple-950 to-slate-900 text-white flex items-center justify-between shrink-0 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/20 border border-purple-400/30 rounded-xl text-purple-300 shadow-xs shrink-0">
              <Receipt size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-black tracking-tight whitespace-nowrap">
                  {target.commissionRecipient} 공급 수수료(특수수당) 정산 명세서
                </h2>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-400/30 whitespace-nowrap">
                  {selectedMonth} 정산
                </span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/30 text-emerald-300 border border-emerald-400/30 whitespace-nowrap">
                  지급처: (주)리치웰페어
                </span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30 whitespace-nowrap">
                  VAT(부가세) 포함
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 whitespace-nowrap">
                관련 공급사는 기준 표기이며, <strong>(주)리치웰페어</strong>에서 수령처 <strong>'{target.commissionRecipient}'</strong> 계좌로 직접 지급합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 whitespace-nowrap">
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
              title="세금계산서 명세서 엑셀 다운로드"
            >
              <Download size={14} />
              <span>명세서 엑셀 다운로드</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-all"
              title="정산 명세서 인쇄"
            >
              <Printer size={14} />
              <span>인쇄</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer ml-1"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 복수 공급사가 있는 수령처인 경우 상단 탭 제공 */}
        {hasMultipleSuppliers && (
          <div className="px-6 py-2.5 bg-purple-50/70 border-b border-purple-100 flex items-center justify-between shrink-0 whitespace-nowrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-purple-900 flex items-center gap-1 mr-1">
                <Building size={14} className="text-purple-700" />
                정산 범위 선택:
              </span>

              <button
                onClick={() => setScope('CURRENT_SUPPLIER')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  scope === 'CURRENT_SUPPLIER'
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'bg-white text-purple-900 hover:bg-purple-100 border border-purple-200'
                }`}
              >
                <span>[{target.supplierName}] 기준</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/20">
                  {target.productCount}건 · {target.totalCommissionAmount.toLocaleString()}원
                </span>
              </button>

              <button
                onClick={() => setScope('ALL_RECIPIENT')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  scope === 'ALL_RECIPIENT'
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'bg-white text-purple-900 hover:bg-purple-100 border border-purple-200'
                }`}
              >
                <span>수령처 전체 통합 (모든 공급사 합산)</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/20">
                  {allRecipientItems.length}건 · {allRecipientItems.reduce((acc, c) => acc + (c.totalCommission || 0), 0).toLocaleString()}원
                </span>
              </button>
            </div>

            <span className="text-xs text-purple-700 font-medium">
              * 리치웰페어에서 굿라이프 수령처로 통합 지급 시 [전체 통합]을 선택하세요.
            </span>
          </div>
        )}

        {/* 본문 스크롤 영역 */}
        <div className="flex-1 overflow-auto p-6 bg-slate-50 custom-scrollbar space-y-6">

          {/* 섹션 1 & 2: 계좌 정보 + 세금계산서 발행 내역 카드 (2단 그리드) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* 1. 계좌 정보 카드 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                    <CreditCard size={18} />
                  </div>
                  <h3 className="text-sm font-black text-slate-800">1. 정산 지급 계좌 정보</h3>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                  지급처: (주)리치웰페어
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-medium block text-[11px]">수수료 수령처</span>
                  <span className="text-slate-900 font-bold text-sm mt-0.5 block">{target.commissionRecipient}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-medium block text-[11px]">예금주</span>
                  <span className="text-slate-900 font-bold text-sm mt-0.5 block">{target.recipientHolder || '-'}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-medium block text-[11px]">수령 은행</span>
                  <span className="text-slate-900 font-bold text-sm mt-0.5 block">{target.recipientBank || '-'}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-medium block text-[11px]">수령 계좌번호</span>
                  <span className="text-indigo-700 font-mono font-bold text-sm mt-0.5 block">{target.recipientAccount || '-'}</span>
                </div>
                <div className="col-span-2 bg-indigo-50/60 p-3 rounded-xl border border-indigo-100 flex items-center justify-between">
                  <div>
                    <span className="text-indigo-800 font-bold text-xs block">지급 기준일 및 운영 안내</span>
                    <span className="text-indigo-600 text-[11px] mt-0.5 block">
                      정산월: {selectedMonth} 말일 지급  |  관련 공급사(기준): {currentSupplierLabel}
                    </span>
                  </div>
                  <Calendar size={18} className="text-indigo-400 shrink-0" />
                </div>
              </div>
            </div>

            {/* 2. 세금계산서 발행 내역 카드 (부가세 포함된 금액으로 부가세와 공급가 표기) */}
            <div className="bg-white rounded-2xl border border-purple-200 p-5 shadow-2xs">
              <div className="flex items-center justify-between pb-3 border-b border-purple-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
                    <Receipt size={18} />
                  </div>
                  <h3 className="text-sm font-black text-slate-800">2. 세금계산서 발행 내역</h3>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200">
                  VAT(부가세) 포함 표기
                </span>
              </div>

              {/* 금액 3칸 그리드 (공급가액 / 부가세 / 합계금액) */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                  <span className="text-slate-500 font-bold text-[11px] block">공급가액</span>
                  <span className="text-slate-800 font-black font-mono text-base mt-1 block">
                    {stats.supplyPrice.toLocaleString()} <span className="text-[11px] font-bold text-slate-500">원</span>
                  </span>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                  <span className="text-slate-500 font-bold text-[11px] block">부가세 (VAT 10%)</span>
                  <span className="text-slate-800 font-black font-mono text-base mt-1 block">
                    {stats.vat.toLocaleString()} <span className="text-[11px] font-bold text-slate-500">원</span>
                  </span>
                </div>

                <div className="bg-linear-to-br from-purple-700 to-indigo-800 p-3 rounded-xl text-white text-center shadow-xs">
                  <span className="text-purple-200 font-bold text-[11px] block">합계금액 (세금계산서 발행총액)</span>
                  <span className="text-amber-300 font-black font-mono text-base mt-1 block">
                    {stats.totalAmount.toLocaleString()} <span className="text-[11px] font-bold text-purple-200">원</span>
                  </span>
                </div>
              </div>

              {/* 한글 금액 표기 & 세금계산서 안내 박스 */}
              <div className="p-3 bg-purple-50/80 rounded-xl border border-purple-200 flex items-center justify-between text-xs">
                <div>
                  <span className="text-purple-900 font-bold block">
                    세금계산서 발행 총액: <span className="text-purple-950 font-black text-sm ml-1">일금 {stats.koreanAmount} 원정</span>
                  </span>
                  <span className="text-purple-700 text-[11px] mt-0.5 block">
                    발행처: (주)리치웰페어  |  지급 대상 수량: 총 {stats.count.toLocaleString()}개 상품
                  </span>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                    <CheckCircle size={11} />
                    <span>발행 일치</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 섹션 3: 상품별 정산 내역 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 whitespace-nowrap">
              <div className="flex items-center gap-2">
                <Package className="text-indigo-600" size={16} />
                <h3 className="text-sm font-black text-slate-800">
                  3. 상품별 정산 내역 ({productSummaries.length}개 상품군)
                </h3>
                <span className="text-xs text-slate-400 font-medium">
                  (관련 공급사 기준별 상품단가 및 세금계산서 발행 내역 집계)
                </span>
              </div>
              <span className="text-xs font-bold text-slate-500">
                총 {stats.count.toLocaleString()}개 수량
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-200 font-bold whitespace-nowrap">
                    <th className="p-3 pl-5 text-center w-12">No</th>
                    <th className="p-3">관련 공급사 (기준)</th>
                    <th className="p-3">상품명 (매칭 제품명)</th>
                    <th className="p-3 text-center">정산 수량</th>
                    <th className="p-3 text-right">수수료 단가 (VAT포함)</th>
                    <th className="p-3 text-right">공급가액</th>
                    <th className="p-3 text-right">부가세 (10%)</th>
                    <th className="p-3 text-right pr-5 font-black text-purple-900">총 지급수수료 (VAT포함)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productSummaries.map((p, idx) => (
                    <tr key={`${p.supplierName}_${p.productName}_${idx}`} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                      <td className="p-3 pl-5 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="p-3 font-bold text-slate-800">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md text-slate-700 font-medium">
                          {p.supplierName}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-900">{p.productName}</td>
                      <td className="p-3 text-center font-bold font-mono text-slate-900">
                        {p.quantity.toLocaleString()}개
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-700">
                        {p.unitPrice.toLocaleString()}원
                      </td>
                      <td className="p-3 text-right font-mono text-slate-600">
                        {p.supplyPrice.toLocaleString()}원
                      </td>
                      <td className="p-3 text-right font-mono text-slate-600">
                        {p.vat.toLocaleString()}원
                      </td>
                      <td className="p-3 text-right font-mono font-black text-purple-700 pr-5">
                        {p.totalAmount.toLocaleString()}원
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-purple-50/50 font-black text-slate-900 border-t-2 border-purple-200 whitespace-nowrap">
                    <td className="p-3 pl-5 text-center" colSpan={3}>합계</td>
                    <td className="p-3 text-center font-mono text-slate-900">{stats.count.toLocaleString()}개</td>
                    <td className="p-3 text-right">-</td>
                    <td className="p-3 text-right font-mono">{stats.supplyPrice.toLocaleString()}원</td>
                    <td className="p-3 text-right font-mono">{stats.vat.toLocaleString()}원</td>
                    <td className="p-3 text-right font-mono text-purple-900 text-sm pr-5">{stats.totalAmount.toLocaleString()}원</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* 섹션 4: 건별 상세 내역 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 whitespace-nowrap">
              <div className="flex items-center gap-2">
                <FileText className="text-purple-600" size={16} />
                <h3 className="text-sm font-black text-slate-800">
                  4. 건별 상세 내역 ({filteredItems.length}건)
                </h3>
                <span className="text-xs text-slate-400 font-medium">
                  (렌탈계약번호 기준 · 배송완료 건)
                </span>
              </div>

              {/* 상세 검색창 */}
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                <input
                  type="text"
                  placeholder="계약번호/고객명/제품/본부 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-purple-500 transition-all"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto max-h-[360px] custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-xs z-10 shadow-2xs">
                  <tr className="text-slate-700 border-b border-slate-200 font-bold whitespace-nowrap">
                    <th className="p-3 pl-4 text-center w-12">No</th>
                    <th className="p-3 font-mono">렌탈계약번호</th>
                    <th className="p-3">계약일자</th>
                    <th className="p-3">배송완료일</th>
                    <th className="p-3">관련 공급사 (기준)</th>
                    <th className="p-3">상품명 (제품명)</th>
                    <th className="p-3">고객명</th>
                    <th className="p-3">소속 본부</th>
                    <th className="p-3">지사</th>
                    <th className="p-3">영업사원</th>
                    <th className="p-3 text-right">수수료 단가</th>
                    <th className="p-3 text-right pr-4 font-black text-purple-900">지급 수수료 (VAT포함)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-10 text-center text-slate-400 whitespace-nowrap">
                        검색 조건에 부합하는 상세 내역이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => (
                      <tr key={item.uniqueKey || idx} className="hover:bg-slate-50/80 transition-colors whitespace-nowrap">
                        <td className="p-3 pl-4 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3 font-mono font-bold text-indigo-700">{item.rentalNo}</td>
                        <td className="p-3 font-mono text-slate-500">{item.contractDate}</td>
                        <td className="p-3 font-mono font-bold text-emerald-700">{item.deliveryDate}</td>
                        <td className="p-3">
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-medium">
                            {item.matchedSupplierName}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-slate-800">{item.matchedProductName || item.prodName}</td>
                        <td className="p-3 font-bold text-slate-900">{item.memName}</td>
                        <td className="p-3 font-bold text-slate-800">{item.hq}</td>
                        <td className="p-3 text-slate-600">{item.branch}</td>
                        <td className="p-3 text-slate-600">{item.empName}</td>
                        <td className="p-3 text-right font-mono text-slate-700">
                          {item.supplyCommission.toLocaleString()}원
                        </td>
                        <td className="p-3 text-right font-mono font-black text-purple-700 pr-4">
                          {item.totalCommission.toLocaleString()}원
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 건별 테이블 하단 요약 */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span className="font-medium">
                표시 중: <strong>{filteredItems.length}</strong>건 / 전체: <strong>{activeItems.length}</strong>건
              </span>
              <span className="font-bold">
                지급 수수료 합계: <span className="text-purple-700 font-black text-sm ml-1 font-mono">{filteredItems.reduce((acc, c) => acc + (c.totalCommission || 0), 0).toLocaleString()}원</span>
              </span>
            </div>
          </div>

        </div>

        {/* 모달 하단 푸터 바 */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between shrink-0 whitespace-nowrap">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Info size={14} className="text-purple-600 shrink-0" />
            <span>
              (주)리치웰페어 정산 시스템  |  수령처: <strong>{target.commissionRecipient}</strong>  |  계좌: {target.recipientBank} {target.recipientAccount} ({target.recipientHolder})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
            >
              <Download size={14} />
              <span>명세서 엑셀 다운로드</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-all"
            >
              닫기
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
