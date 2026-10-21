import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Download,
  Search,
  Filter,
  DollarSign,
  Calendar,
  Layers,
  ArrowUpDown,
  History,
  Save,
  Check,
  RefreshCw,
  Info,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Percent,
  PackageCheck,
  HelpCircle,
  AlertCircle
} from 'lucide-react';

// @ts-ignore
const XLSX = (window as any).XLSX;

export interface EnexSummary {
  title: string;
  totalCount: number;
  totalSales: number;
  basicFee: number;
  refundFee: number;
  totalFee: number;
}

export interface EnexReconciliationRow {
  contractNo: string;        // 1. 계약번호 (A열)
  branchOffice: string;      // 2. 판매점 (N열)
  prodName: string;          // 3. 제품명 (ERP 상품명 or 엑셀 상품명 D열)
  deliveryDate: string;      // 4. 배송일자 (ERP 배송일자 or 엑셀 K열)
  salesAmount: number;       // 5. 매출액 (H열 결합매출액)
  accountCount: number;      // 6. 적용구좌 (Q열 또는 매출액 기반 1, 2, 3구좌)
  feeRate: number;           // 7. 금융수수료율 (기본 0.26, 노란색 음영이면 0.30)
  unitSupplyPrice: number;   // 8. 구좌당공급가 (550000, 750000, 800000)
  financialFee: number;      // 9. 금융수수료 (매출액 * 금융수수료율)
  totalSupplyPrice: number;  // 10. 공급가합계 (구좌당공급가 * 적용구좌)
  calculatedFee: number;     // 11. 계산수수료 (매출액 - 금융수수료 - 공급가합계)
  enexFee: number;           // 12. 에넥스수수료 (O열 수수료 합계)
  diff: number;              // 13. 차액 (계산수수료 - 에넥스수수료)
  reconResult: '일치' | '확인필요'; // 14. 대조결과
  isYellow: boolean;         // 노란색 음영 여부
  erpMatched: boolean;       // 우리 ERP 데이터 매칭 여부
  erpData?: any;             // 매칭된 ERP 고객명, 본부, 지사, 담당자 등
  orderIndex: number;        // 원본 행 번호
}

export interface EnexSettlementHistoryItem {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  payoutDate: string;
  count: number;
  totalSales: number;
  totalEnexFee: number;
  totalCalculatedFee: number;
  createdAt: string;
  worker?: string;
  items?: EnexReconciliationRow[];
}

interface EnexReconciliationTabProps {
  erpData?: any[];
  currentUser?: any;
}

export const EnexReconciliationTab: React.FC<EnexReconciliationTabProps> = ({
  erpData = [],
  currentUser
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 업로드 파일 및 파싱 상태
  const [fileName, setFileName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [summaryData, setSummaryData] = useState<EnexSummary | null>(null);
  const [reconRows, setReconRows] = useState<EnexReconciliationRow[]>([]);

  // 필터 및 검색 상태
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterResult, setFilterResult] = useState<'ALL' | 'MATCH' | 'MISMATCH'>('ALL');
  const [filterRate, setFilterRate] = useState<'ALL' | '26' | '30'>('ALL');
  const [filterDateStart, setFilterDateStart] = useState<string>('');
  const [filterDateEnd, setFilterDateEnd] = useState<string>('');

  // 에넥스 지급완료 기록 모달 상태
  const [isRecordModalOpen, setIsRecordModalOpen] = useState<boolean>(false);
  const [recordTitle, setRecordTitle] = useState<string>('');
  const [recordPayoutDate, setRecordPayoutDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [recordPeriodStart, setRecordPeriodStart] = useState<string>('');
  const [recordPeriodEnd, setRecordPeriodEnd] = useState<string>('');
  const [isSavingRecord, setIsSavingRecord] = useState<boolean>(false);

  // 지급완료 이력 모달 상태
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [historyList, setHistoryList] = useState<EnexSettlementHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<EnexSettlementHistoryItem | null>(null);

  // 로컬 스토리지에서 지급완료 이력 로드
  const loadLocalSettlementHistory = (): EnexSettlementHistoryItem[] => {
    try {
      const stored = localStorage.getItem('erp_enex_settlements_v1');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load local enex settlements history', e);
    }
    return [];
  };

  // 로컬 스토리지에 지급완료 이력 저장
  const saveLocalSettlementHistory = (list: EnexSettlementHistoryItem[]) => {
    try {
      localStorage.setItem('erp_enex_settlements_v1', JSON.stringify(list));
    } catch (e) {
      console.error('Failed to save local enex settlements history', e);
    }
  };

  // 구좌당 공급가 판정 헬퍼
  // 상품별: 55만(하이브리드698, 라이즈498, 굿라이프실버), 75만(프리미엄540, 굿라이프골드), 80만(프리미엄540플러스, 굿라이프올인원)
  const determineUnitSupplyPrice = (
    prodName: string,
    sales: number,
    feeRate: number,
    enexFee: number,
    accountCount: number
  ): number => {
    const clean = (prodName || '').replace(/\s+/g, '').toLowerCase();

    // 1. 800,000원 상품군
    if (
      clean.includes('540+') ||
      clean.includes('540플러스') ||
      clean.includes('올인원') ||
      clean.includes('ro585hgh_js(540+)') ||
      clean.includes('k135lw123+hei1v9e_js(540+)') ||
      clean.includes('t17dx3a_js(a)')
    ) {
      return 800000;
    }

    // 2. 750,000원 상품군
    if (clean.includes('540') || clean.includes('골드')) {
      return 750000;
    }

    // 3. 550,000원 상품군
    if (
      clean.includes('698') ||
      clean.includes('498') ||
      clean.includes('하이브리드') ||
      clean.includes('라이즈') ||
      clean.includes('실버')
    ) {
      return 550000;
    }

    // 4. 역산 보조: (매출액 - 금융수수료 - 에넥스수수료) / 적용구좌 에 가장 근접한 기준 단가 매칭
    if (sales > 0 && accountCount > 0) {
      const estimatedSupplyTotal = sales - Math.round(sales * feeRate) - enexFee;
      const unitEst = estimatedSupplyTotal / accountCount;
      const candidates = [550000, 750000, 800000];
      let bestCandidate = 550000;
      let minDiff = Infinity;
      for (const cand of candidates) {
        const diff = Math.abs(cand - unitEst);
        if (diff < minDiff) {
          minDiff = diff;
          bestCandidate = cand;
        }
      }
      if (minDiff <= 50000) {
        return bestCandidate;
      }
    }

    // 기본값: 매출액이 228만이상이면 80만, 198만이면 55만
    if (sales >= 2280000) return 800000;
    return 550000;
  };

  // 단일 행 재계산 헬퍼
  const calculateRowMetrics = (
    sales: number,
    feeRate: number,
    unitPrice: number,
    accountCount: number,
    enexFee: number
  ) => {
    const financialFee = Math.round(sales * feeRate);
    const totalSupplyPrice = unitPrice * accountCount;
    const calculatedFee = sales - financialFee - totalSupplyPrice;
    const diff = calculatedFee - enexFee;
    const reconResult: '일치' | '확인필요' = Math.abs(diff) < 1 ? '일치' : '확인필요';
    return { financialFee, totalSupplyPrice, calculatedFee, diff, reconResult };
  };

  // 엑셀 파일 업로드 및 파싱
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsLoading(true);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { cellStyles: true, type: 'array' });

      if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
        throw new Error('유효한 엑셀 파일이 아닙니다.');
      }

      // ==========================================
      // 1. 첫 번째 시트 (정산 요약) 파싱
      // ==========================================
      const sheet1Name = wb.SheetNames[0];
      const sheet1 = wb.Sheets[sheet1Name];
      const sheet1Rows: any[][] = XLSX.utils.sheet_to_json(sheet1, { header: 1, defval: '' });

      let parsedSummary: EnexSummary = {
        title: sheet1Name,
        totalCount: 0,
        totalSales: 0,
        basicFee: 0,
        refundFee: 0,
        totalFee: 0
      };

      // 시트 1 제목 추출 (보통 1~2행)
      for (let r = 0; r < Math.min(sheet1Rows.length, 3); r++) {
        const rowStr = sheet1Rows[r].join(' ');
        if (rowStr.includes('스마트렌탈') || rowStr.includes('수수료 정산서') || rowStr.includes('정산서')) {
          parsedSummary.title = (sheet1Rows[r][0] || sheet1Rows[r][1] || rowStr).trim();
          break;
        }
      }

      // 헤더 위치 검색 (실적, 총 매출금액, 기본수수료, 환수수수료, 수수료 합계)
      let sumHeaderRowIdx = -1;
      for (let r = 0; r < Math.min(sheet1Rows.length, 10); r++) {
        const rowText = (sheet1Rows[r] || []).map(c => String(c).replace(/\s+/g, '')).join('|');
        if (
          rowText.includes('총매출금액') ||
          rowText.includes('총매출') ||
          (rowText.includes('기본수수료') && rowText.includes('수수료합계'))
        ) {
          sumHeaderRowIdx = r;
          break;
        }
      }

      if (sumHeaderRowIdx !== -1 && sumHeaderRowIdx + 1 < sheet1Rows.length) {
        const hRow = sheet1Rows[sumHeaderRowIdx].map(c => String(c).replace(/\s+/g, ''));
        const valRow = sheet1Rows[sumHeaderRowIdx + 1];

        const idxCount = hRow.findIndex(h => h.includes('실적') || h.includes('건수'));
        const idxSales = hRow.findIndex(h => h.includes('총매출') || h.includes('결합매출'));
        const idxBasic = hRow.findIndex(h => h.includes('기본수수료'));
        const idxRefund = hRow.findIndex(h => h.includes('환수수수료') || h.includes('환수'));
        const idxTotal = hRow.findIndex(h => h.includes('수수료합계') || h.includes('수수료(total)'));

        if (idxCount !== -1) parsedSummary.totalCount = Number(valRow[idxCount]) || 0;
        if (idxSales !== -1) parsedSummary.totalSales = Number(valRow[idxSales]) || 0;
        if (idxBasic !== -1) parsedSummary.basicFee = Number(valRow[idxBasic]) || 0;
        if (idxRefund !== -1) parsedSummary.refundFee = Number(valRow[idxRefund]) || 0;
        if (idxTotal !== -1) parsedSummary.totalFee = Number(valRow[idxTotal]) || 0;
      }

      // ==========================================
      // 2. 세 번째 시트 (모델별상세) 파싱 및 대사
      // ==========================================
      // 3번째 시트 우선, 없으면 '모델별' 또는 '상세' 이름 포함 시트 검색
      let detailSheetName = wb.SheetNames.length >= 3 ? wb.SheetNames[2] : wb.SheetNames[0];
      const foundDetailSheet = wb.SheetNames.find(s => s.includes('모델별상세') || s.includes('모델별') || s.includes('상세'));
      if (foundDetailSheet) {
        detailSheetName = foundDetailSheet;
      }
      const sheet3 = wb.Sheets[detailSheetName];

      const range = XLSX.utils.decode_range(sheet3['!ref'] || 'A1:Q1');
      const parsedReconRows: EnexReconciliationRow[] = [];

      // 헤더 행 탐색 (보통 Row 2)
      let headerRowIdx = 1; // 0-based
      for (let r = 0; r <= Math.min(range.e.r, 5); r++) {
        const cellA = sheet3[XLSX.utils.encode_cell({ r, c: 0 })];
        const valA = cellA ? String(cellA.v).replace(/\s+/g, '') : '';
        if (valA.includes('계약번호') || valA.includes('계약id')) {
          headerRowIdx = r;
          break;
        }
      }

      const getCell = (r: number, c: number) => {
        return sheet3[XLSX.utils.encode_cell({ r, c })];
      };
      const getVal = (r: number, c: number) => {
        const cell = getCell(r, c);
        return cell ? cell.v : '';
      };

      // 데이터 행 순회
      for (let r = headerRowIdx + 1; r <= range.e.r; r++) {
        const cellA = getCell(r, 0); // A열 계약번호
        if (!cellA || cellA.v === undefined || cellA.v === null || String(cellA.v).trim() === '') {
          continue;
        }

        const contractNo = String(cellA.v).trim();
        // 헤더나 합계 텍스트인 경우 건너뜀
        if (contractNo.includes('합계') || contractNo.includes('소계') || contractNo.includes('계약번호')) {
          continue;
        }

        const salesAmount = Number(getVal(r, 7)) || 0; // H열 결합매출액
        const enexFee = Number(getVal(r, 14)) || 0;     // O열 수수료 합계
        const branchOffice = String(getVal(r, 13) || '').trim(); // N열 판매점
        const prodDetailName = String(getVal(r, 3) || '').trim(); // D열 상품명
        const combineModel = String(getVal(r, 4) || '').trim(); // E열 결합모델명
        const deliveryDateExcel = String(getVal(r, 10) || '').trim(); // K열 배송일
        const remark = String(getVal(r, 16) || '').trim(); // Q열 비고

        // 구좌수 파악
        let accountCount = 1;
        if (remark.includes('2구좌') || salesAmount === 3960000 || salesAmount === 4560000) {
          accountCount = 2;
        } else if (remark.includes('3구좌') || salesAmount === 6840000) {
          accountCount = 3;
        } else if (remark.includes('1구좌')) {
          accountCount = 1;
        }

        // A열 노란색 음영 판별 (노란색이면 30%, 기본 26%)
        let isYellow = false;
        if (cellA.s) {
          const fgRgb = cellA.s.fgColor?.rgb || cellA.s.fill?.fgColor?.rgb;
          const bgRgb = cellA.s.bgColor?.rgb;
          const theme = cellA.s.fgColor?.theme;
          if (
            fgRgb === 'FFFF00' ||
            fgRgb === 'FFF2CC' ||
            fgRgb === 'FFFFE0' ||
            fgRgb === 'FFE599' ||
            fgRgb === 'FFD966' ||
            bgRgb === 'FFFF00' ||
            theme === 4
          ) {
            isYellow = true;
          }
        }

        // Fallback 요율 판정: 혹시 셀 스타일이 없더라도 수수료로 역산 검증
        let feeRate = isYellow ? 0.30 : 0.26;
        if (!isYellow && salesAmount > 0) {
          // 30%로 계산 시 차액 0이 되고 26%로 계산 시 오차가 생기면 30%로 보정
          const diff30 = Math.abs((salesAmount - Math.round(salesAmount * 0.30)) - enexFee);
          const diff26 = Math.abs((salesAmount - Math.round(salesAmount * 0.26)) - enexFee);
          if (diff30 % 50000 === 0 && diff26 % 50000 !== 0) {
            // 30% 요율 가능성 높음
            feeRate = 0.30;
            isYellow = true;
          }
        }

        // ERP 데이터와 계약번호(rentalNo) 매칭
        const matchedErp = erpData.find(d => {
          const rNo = String(d.rentalNo || '').replace(/\s+/g, '');
          return rNo === contractNo || rNo.includes(contractNo) || contractNo.includes(rNo);
        });

        const prodName = matchedErp?.prodName || prodDetailName || combineModel;
        const deliveryDate = matchedErp?.deliveryDate || deliveryDateExcel;

        // 구좌당 공급가 판정
        const unitSupplyPrice = determineUnitSupplyPrice(
          prodName,
          salesAmount,
          feeRate,
          enexFee,
          accountCount
        );

        // 계산 산식
        const { financialFee, totalSupplyPrice, calculatedFee, diff, reconResult } = calculateRowMetrics(
          salesAmount,
          feeRate,
          unitSupplyPrice,
          accountCount,
          enexFee
        );

        parsedReconRows.push({
          contractNo,
          branchOffice,
          prodName,
          deliveryDate,
          salesAmount,
          accountCount,
          feeRate,
          unitSupplyPrice,
          financialFee,
          totalSupplyPrice,
          calculatedFee,
          enexFee,
          diff,
          reconResult,
          isYellow,
          erpMatched: !!matchedErp,
          erpData: matchedErp,
          orderIndex: r + 1
        });
      }

      // 요약 카드 값 보정 (시트1에서 안 잡혔을 경우 디테일 합계로 보완)
      if (parsedSummary.totalCount === 0) {
        parsedSummary.totalCount = parsedReconRows.length;
      }
      if (parsedSummary.totalSales === 0) {
        parsedSummary.totalSales = parsedReconRows.reduce((sum, r) => sum + r.salesAmount, 0);
      }
      if (parsedSummary.totalFee === 0) {
        parsedSummary.totalFee = parsedReconRows.reduce((sum, r) => sum + r.enexFee, 0);
      }

      // 배송일자 범위 자동 설정 (지급완료 기록 팝업 기본값용)
      const validDates = parsedReconRows
        .map(r => r.deliveryDate)
        .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort();
      if (validDates.length > 0) {
        setRecordPeriodStart(validDates[0]);
        setRecordPeriodEnd(validDates[validDates.length - 1]);
        const m = validDates[0].slice(5, 7);
        setRecordTitle(`${validDates[0].slice(0, 4)}년 ${parseInt(m, 10)}월 에넥스 위탁판매 수수료 지급완료`);
      } else {
        setRecordTitle('에넥스 위탁판매 수수료 지급완료');
      }

      setSummaryData(parsedSummary);
      setReconRows(parsedReconRows);
    } catch (err: any) {
      console.error('Error parsing enex excel:', err);
      alert('엑셀 파일 파싱 중 오류가 발생했습니다: ' + (err.message || '파일 형식을 확인해주세요.'));
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 행별 금융수수료율 토글 (26% <-> 30%)
  const handleToggleFeeRate = (idx: number) => {
    setReconRows(prev => {
      const copy = [...prev];
      const row = { ...copy[idx] };
      const newRate = row.feeRate === 0.26 ? 0.30 : 0.26;
      row.feeRate = newRate;
      row.isYellow = newRate === 0.30;
      const metrics = calculateRowMetrics(
        row.salesAmount,
        newRate,
        row.unitSupplyPrice,
        row.accountCount,
        row.enexFee
      );
      Object.assign(row, metrics);
      copy[idx] = row;
      return copy;
    });
  };

  // 행별 구좌당공급가 변경 (55만, 75만, 80만)
  const handleChangeSupplyPrice = (idx: number, newPrice: number) => {
    setReconRows(prev => {
      const copy = [...prev];
      const row = { ...copy[idx] };
      row.unitSupplyPrice = newPrice;
      const metrics = calculateRowMetrics(
        row.salesAmount,
        row.feeRate,
        newPrice,
        row.accountCount,
        row.enexFee
      );
      Object.assign(row, metrics);
      copy[idx] = row;
      return copy;
    });
  };

  // 필터링된 대사 행 목록
  const filteredRows = useMemo(() => {
    return reconRows.filter(row => {
      // 1. 검색어 필터
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchContract = row.contractNo.toLowerCase().includes(term);
        const matchBranch = row.branchOffice.toLowerCase().includes(term);
        const matchProd = row.prodName.toLowerCase().includes(term);
        const matchCust = String(row.erpData?.memName || '').toLowerCase().includes(term);
        const matchHq = String(row.erpData?.hq || '').toLowerCase().includes(term);
        if (!matchContract && !matchBranch && !matchProd && !matchCust && !matchHq) {
          return false;
        }
      }

      // 2. 대조결과 필터
      if (filterResult === 'MATCH' && row.reconResult !== '일치') return false;
      if (filterResult === 'MISMATCH' && row.reconResult !== '확인필요') return false;

      // 3. 금융수수료율 필터
      if (filterRate === '26' && row.feeRate !== 0.26) return false;
      if (filterRate === '30' && row.feeRate !== 0.30) return false;

      // 4. 배송일자 기간 필터
      if (filterDateStart && row.deliveryDate && row.deliveryDate < filterDateStart) return false;
      if (filterDateEnd && row.deliveryDate && row.deliveryDate > filterDateEnd) return false;

      return true;
    });
  }, [reconRows, searchTerm, filterResult, filterRate, filterDateStart, filterDateEnd]);

  // 대사 통계 집계
  const stats = useMemo(() => {
    const totalCount = reconRows.length;
    const matchCount = reconRows.filter(r => r.reconResult === '일치').length;
    const mismatchCount = totalCount - matchCount;

    const rate26Count = reconRows.filter(r => r.feeRate === 0.26).length;
    const rate30Count = reconRows.filter(r => r.feeRate === 0.30).length;

    const filteredTotalSales = filteredRows.reduce((sum, r) => sum + r.salesAmount, 0);
    const filteredTotalFinancialFee = filteredRows.reduce((sum, r) => sum + r.financialFee, 0);
    const filteredTotalSupplyPrice = filteredRows.reduce((sum, r) => sum + r.totalSupplyPrice, 0);
    const filteredTotalCalculatedFee = filteredRows.reduce((sum, r) => sum + r.calculatedFee, 0);
    const filteredTotalEnexFee = filteredRows.reduce((sum, r) => sum + r.enexFee, 0);
    const filteredTotalDiff = filteredRows.reduce((sum, r) => sum + r.diff, 0);

    return {
      totalCount,
      matchCount,
      mismatchCount,
      rate26Count,
      rate30Count,
      filteredCount: filteredRows.length,
      filteredTotalSales,
      filteredTotalFinancialFee,
      filteredTotalSupplyPrice,
      filteredTotalCalculatedFee,
      filteredTotalEnexFee,
      filteredTotalDiff
    };
  }, [reconRows, filteredRows]);

  // 대사 결과 엑셀 내보내기 (수식 & 서식 완벽 적용)
  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      alert('내보낼 대사 데이터가 없습니다.');
      return;
    }

    try {
      const wb = XLSX.utils.book_new();

      // 헤더 정의 (사용자가 요청한 14개 컬럼 순서)
      const headers = [
        '계약번호',
        '판매점',
        '제품명',
        '배송일자',
        '매출액',
        '적용구좌',
        '금융수수료율',
        '구좌당공급가',
        '금융수수료',
        '공급가합계',
        '계산수수료',
        '에넥스수수료',
        '차액',
        '대조결과',
        '고객명(ERP)',
        '본부명(ERP)'
      ];

      const wsData: any[][] = [headers];

      filteredRows.forEach((r, idx) => {
        const rowNum = idx + 2; // 엑셀 행 번호 (1-based, 1행은 헤더)
        wsData.push([
          r.contractNo,
          r.branchOffice,
          r.prodName,
          r.deliveryDate,
          { t: 'n', v: r.salesAmount, z: '#,##0' },
          { t: 'n', v: r.accountCount, z: '#,##0' },
          { t: 'n', v: r.feeRate, z: '0.0%' },
          { t: 'n', v: r.unitSupplyPrice, z: '#,##0' },
          // 금융수수료 수식: ROUND(매출액 * 금융수수료율, 0)
          { t: 'n', f: `ROUND(E${rowNum}*G${rowNum}, 0)`, v: r.financialFee, z: '#,##0' },
          // 공급가합계 수식: 구좌당공급가 * 적용구좌
          { t: 'n', f: `H${rowNum}*F${rowNum}`, v: r.totalSupplyPrice, z: '#,##0' },
          // 계산수수료 수식: 매출액 - 금융수수료 - 공급가합계
          { t: 'n', f: `E${rowNum}-I${rowNum}-J${rowNum}`, v: r.calculatedFee, z: '#,##0' },
          // 에넥스수수료
          { t: 'n', v: r.enexFee, z: '#,##0' },
          // 차액 수식: 계산수수료 - 에넥스수수료
          { t: 'n', f: `K${rowNum}-L${rowNum}`, v: r.diff, z: '#,##0' },
          // 대조결과 수식: IF(차액=0, "일치", "확인필요")
          { t: 's', f: `IF(M${rowNum}=0, "일치", "확인필요")`, v: r.reconResult },
          r.erpData?.memName || '',
          r.erpData?.hq || ''
        ]);
      });

      // 합계 행 추가
      const totalRowNum = filteredRows.length + 2;
      wsData.push([
        '합계',
        '',
        '',
        '',
        { t: 'n', f: `SUM(E2:E${totalRowNum - 1})`, v: stats.filteredTotalSales, z: '#,##0' },
        '',
        '',
        '',
        { t: 'n', f: `SUM(I2:I${totalRowNum - 1})`, v: stats.filteredTotalFinancialFee, z: '#,##0' },
        { t: 'n', f: `SUM(J2:J${totalRowNum - 1})`, v: stats.filteredTotalSupplyPrice, z: '#,##0' },
        { t: 'n', f: `SUM(K2:K${totalRowNum - 1})`, v: stats.filteredTotalCalculatedFee, z: '#,##0' },
        { t: 'n', f: `SUM(L2:L${totalRowNum - 1})`, v: stats.filteredTotalEnexFee, z: '#,##0' },
        { t: 'n', f: `SUM(M2:M${totalRowNum - 1})`, v: stats.filteredTotalDiff, z: '#,##0' },
        '',
        '',
        ''
      ]);

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // 열 너비 지정
      ws['!cols'] = [
        { wch: 14 }, // 계약번호
        { wch: 18 }, // 판매점
        { wch: 30 }, // 제품명
        { wch: 12 }, // 배송일자
        { wch: 14 }, // 매출액
        { wch: 10 }, // 적용구좌
        { wch: 13 }, // 금융수수료율
        { wch: 14 }, // 구좌당공급가
        { wch: 14 }, // 금융수수료
        { wch: 14 }, // 공급가합계
        { wch: 14 }, // 계산수수료
        { wch: 14 }, // 에넥스수수료
        { wch: 12 }, // 차액
        { wch: 12 }, // 대조결과
        { wch: 12 }, // 고객명
        { wch: 12 }  // 본부명
      ];

      // Sheet 1 (요약 시트)도 함께 포함
      if (summaryData) {
        const summaryWsData = [
          [summaryData.title || '에넥스 위탁판매 수수료 정산서 요약'],
          [''],
          ['구분', '금액 / 건수'],
          ['실적 (총 건수)', { t: 'n', v: summaryData.totalCount, z: '#,##0' }],
          ['총 매출금액', { t: 'n', v: summaryData.totalSales, z: '#,##0' }],
          ['기본수수료', { t: 'n', v: summaryData.basicFee, z: '#,##0' }],
          ['환수수수료', { t: 'n', v: summaryData.refundFee, z: '#,##0' }],
          ['수수료 합계 (입금액)', { t: 'n', v: summaryData.totalFee, z: '#,##0' }],
          [''],
          ['대사 검증 결과'],
          ['일치 건수', `${stats.matchCount} 건`],
          ['확인필요 건수', `${stats.mismatchCount} 건`],
          ['대사 차액 합계', { t: 'n', v: stats.filteredTotalDiff, z: '#,##0' }]
        ];
        const sumWs = XLSX.utils.aoa_to_sheet(summaryWsData);
        sumWs['!cols'] = [{ wch: 24 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, sumWs, '정산 요약');
      }

      XLSX.utils.book_append_sheet(wb, ws, '모델별 수수료 대사결과');

      // 엑셀 수식 자동 계산 활성화
      if (!wb.Workbook) wb.Workbook = {};
      if (!wb.Workbook.CalcPr) wb.Workbook.CalcPr = {};
      wb.Workbook.CalcPr.fullCalcOnLoad = true;

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      XLSX.writeFile(wb, `에넥스_수수료_대사결과_${dateStr}.xlsx`);
    } catch (err: any) {
      console.error('Export error:', err);
      alert('엑셀 내보내기 중 오류가 발생했습니다: ' + err.message);
    }
  };

  // 에넥스 지급완료 기록 및 구글 시트 저장
  const handleSaveSettlementRecord = async () => {
    if (!recordTitle.trim()) {
      alert('정산 명칭을 입력해주세요.');
      return;
    }
    if (filteredRows.length === 0) {
      alert('지급완료 처리할 대사 내역이 없습니다.');
      return;
    }

    const confirmMsg = `[에넥스 지급완료 기록 확인]\n\n` +
      `• 정산명: ${recordTitle}\n` +
      `• 대상 기간: ${recordPeriodStart || '전체'} ~ ${recordPeriodEnd || '전체'}\n` +
      `• 지급일자: ${recordPayoutDate}\n` +
      `• 처리 건수: ${filteredRows.length.toLocaleString()}건\n` +
      `• 에넥스 수수료 총액: ${stats.filteredTotalEnexFee.toLocaleString()}원\n\n` +
      `구글 시트 '에넥스정산내역' 탭에 저장하고 지급완료 이력으로 기록하시겠습니까?`;

    if (!window.confirm(confirmMsg)) return;

    setIsSavingRecord(true);
    try {
      // 1. 서버 API 호출하여 구글 시트 '에넥스정산내역'에 저장
      const rowsToSave = filteredRows.map(r => [
        r.contractNo,
        r.branchOffice,
        r.prodName,
        r.deliveryDate,
        r.salesAmount,
        r.accountCount,
        r.feeRate,
        r.unitSupplyPrice,
        r.financialFee,
        r.totalSupplyPrice,
        r.calculatedFee,
        r.enexFee,
        r.diff,
        r.reconResult,
        r.erpData?.memName || '',
        r.erpData?.hq || ''
      ]);

      const res = await fetch('/api/sheets/enex-settlements/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: recordTitle,
          periodStart: recordPeriodStart,
          periodEnd: recordPeriodEnd,
          payoutDate: recordPayoutDate,
          rows: rowsToSave,
          worker: currentUser?.name || currentUser?.username || '관리자'
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || '서버 저장 중 오류가 발생했습니다.');
      }

      // 2. 로컬 스토리지에 스냅샷 이력 추가
      const newHistoryItem: EnexSettlementHistoryItem = {
        id: 'ENEX_' + Date.now(),
        title: recordTitle,
        periodStart: recordPeriodStart,
        periodEnd: recordPeriodEnd,
        payoutDate: recordPayoutDate,
        count: filteredRows.length,
        totalSales: stats.filteredTotalSales,
        totalEnexFee: stats.filteredTotalEnexFee,
        totalCalculatedFee: stats.filteredTotalCalculatedFee,
        createdAt: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }),
        worker: currentUser?.name || currentUser?.username || '관리자',
        items: filteredRows
      };

      const existingHistory = loadLocalSettlementHistory();
      const updatedHistory = [newHistoryItem, ...existingHistory];
      saveLocalSettlementHistory(updatedHistory);
      setHistoryList(updatedHistory);

      alert(`✅ 에넥스 지급완료 기록이 성공적으로 저장되었습니다!\n\n총 ${filteredRows.length.toLocaleString()}건 (${stats.filteredTotalEnexFee.toLocaleString()}원)이 '에넥스정산내역' 시트에 기록되었습니다.`);
      setIsRecordModalOpen(false);
    } catch (err: any) {
      console.error('Failed to save enex settlement record:', err);
      alert('지급완료 기록 저장 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsSavingRecord(false);
    }
  };

  // 지급완료 이력 불러오기 (서버 및 로컬)
  const handleOpenHistoryModal = async () => {
    setIsHistoryModalOpen(true);
    setIsLoadingHistory(true);

    try {
      // 로컬 스냅샷 먼저 로드
      const localList = loadLocalSettlementHistory();
      setHistoryList(localList);

      // 서버에서 구글 시트 등록 내역 조회
      const res = await fetch('/api/sheets/enex-settlements');
      if (res.ok) {
        const data = await res.json();
        if (data.list && Array.isArray(data.list) && data.list.length > 0) {
          // 정산명별로 그룹핑하여 통계 생성
          const groupMap = new Map<string, any>();
          data.list.forEach((row: any) => {
            const key = row['정산명'] || '미분류 정산';
            if (!groupMap.has(key)) {
              groupMap.set(key, {
                id: 'SERVER_' + key,
                title: key,
                periodStart: (row['정산기간'] || '').split('~')[0]?.trim() || '',
                periodEnd: (row['정산기간'] || '').split('~')[1]?.trim() || '',
                payoutDate: row['지급일자'] || '',
                count: 0,
                totalSales: 0,
                totalEnexFee: 0,
                totalCalculatedFee: 0,
                createdAt: row['등록일시'] || '',
                worker: row['등록자'] || ''
              });
            }
            const grp = groupMap.get(key);
            grp.count += 1;
            grp.totalSales += Number(row['매출액']) || 0;
            grp.totalEnexFee += Number(row['에넥스수수료']) || 0;
            grp.totalCalculatedFee += Number(row['계산수수료']) || 0;
          });

          const serverGroupList = Array.from(groupMap.values());
          if (serverGroupList.length > 0) {
            // 로컬과 병합 (서버 그룹 우선)
            setHistoryList(serverGroupList);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch enex settlements history from server:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* 1. 상단 파일 업로드 및 정산서 요약 영역 */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-2xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-black rounded-md">
                에넥스 정산 대사 엔진
              </span>
              <h4 className="text-base font-black text-slate-800">
                에넥스 스마트렌탈 위탁판매 수수료 정산서 대사
              </h4>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              에넥스 정산 엑셀을 업로드하면 Sheet 1(총매출·수수료)과 Sheet 3(모델별상세)를 자동 분석하여 1원 단위까지 완벽 대사합니다.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Upload size={14} />
              {reconRows.length > 0 ? '정산서 파일 변경' : '에넥스 정산서 업로드 (.xlsx)'}
            </button>

            <button
              type="button"
              onClick={handleOpenHistoryModal}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
              title="이전에 기록된 에넥스 지급완료 내역 조회"
            >
              <History size={14} className="text-slate-500" />
              <span>지급완료 이력</span>
            </button>
          </div>
        </div>

        {/* 첫 번째 시트 (정산 요약 지표 카드) */}
        {summaryData && (
          <div className="mt-3 pt-3 border-t border-slate-200/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <FileSpreadsheet size={13} className="text-indigo-600" />
                {summaryData.title}
                {fileName && <span className="text-slate-400 font-normal">({fileName})</span>}
              </span>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-md">
                  대사 일치: {stats.matchCount.toLocaleString()}건
                </span>
                {stats.mismatchCount > 0 && (
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[11px] font-bold rounded-md">
                    확인필요: {stats.mismatchCount.toLocaleString()}건
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 block">실적 (총 건수)</span>
                <span className="text-base font-black text-slate-800">{summaryData.totalCount.toLocaleString()} 건</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 block">총 매출금액</span>
                <span className="text-base font-black text-slate-800">{summaryData.totalSales.toLocaleString()} 원</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 block">기본수수료</span>
                <span className="text-base font-black text-indigo-700">{summaryData.basicFee.toLocaleString()} 원</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 block">환수수수료</span>
                <span className={`text-base font-black ${summaryData.refundFee < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                  {summaryData.refundFee.toLocaleString()} 원
                </span>
              </div>
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-2.5 rounded-xl border border-indigo-200 shadow-2xs">
                <span className="text-[11px] font-black text-indigo-900 block">수수료 합계 (입금액)</span>
                <span className="text-base font-black text-indigo-900">{summaryData.totalFee.toLocaleString()} 원</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. 필터 및 컨트롤 툴바 */}
      {reconRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* 검색 및 필터 버튼 그룹 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 검색창 */}
            <div className="relative w-48 sm:w-56">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="계약번호 / 판매점 / 제품명"
                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>

            {/* 대조결과 필터 */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setFilterResult('ALL')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterResult === 'ALL' ? 'bg-white text-slate-800 shadow-2xs font-black' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                전체 ({reconRows.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterResult('MATCH')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterResult === 'MATCH' ? 'bg-emerald-600 text-white shadow-2xs font-black' : 'text-slate-600 hover:text-emerald-700'
                }`}
              >
                일치 ({stats.matchCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterResult('MISMATCH')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  filterResult === 'MISMATCH' ? 'bg-rose-600 text-white shadow-2xs font-black' : 'text-slate-600 hover:text-rose-700'
                }`}
              >
                확인필요 ({stats.mismatchCount})
              </button>
            </div>

            {/* 금융수수료율 필터 */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setFilterRate('ALL')}
                className={`px-2 py-1 rounded-lg cursor-pointer ${filterRate === 'ALL' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500'}`}
              >
                요율 전체
              </button>
              <button
                type="button"
                onClick={() => setFilterRate('26')}
                className={`px-2 py-1 rounded-lg cursor-pointer ${filterRate === '26' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-500'}`}
              >
                26% ({stats.rate26Count})
              </button>
              <button
                type="button"
                onClick={() => setFilterRate('30')}
                className={`px-2 py-1 rounded-lg cursor-pointer ${filterRate === '30' ? 'bg-amber-400 text-amber-950 shadow-2xs' : 'text-slate-500'}`}
              >
                30% (노랑 {stats.rate30Count})
              </button>
            </div>

            {/* 배송일자 필터 */}
            <div className="flex items-center gap-1 text-xs text-slate-600">
              <Calendar size={13} className="text-slate-400" />
              <input
                type="date"
                value={filterDateStart}
                onChange={e => setFilterDateStart(e.target.value)}
                className="px-1.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
              <span>~</span>
              <input
                type="date"
                value={filterDateEnd}
                onChange={e => setFilterDateEnd(e.target.value)}
                className="px-1.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
              {(filterDateStart || filterDateEnd) && (
                <button
                  type="button"
                  onClick={() => { setFilterDateStart(''); setFilterDateEnd(''); }}
                  className="text-slate-400 hover:text-slate-600 text-[10px] underline ml-1 cursor-pointer"
                >
                  초기화
                </button>
              )}
            </div>
          </div>

          {/* 액션 버튼들 */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
              title="계산 서식과 수식이 완벽히 반영된 대사 결과 엑셀 다운로드"
            >
              <Download size={13} />
              <span>대사결과 엑셀 다운로드</span>
            </button>

            <button
              type="button"
              onClick={() => setIsRecordModalOpen(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
              title="에넥스 지급완료 기록으로 저장 (10월 1~15일 배송완료 등)"
            >
              <Save size={13} />
              <span>에넥스 지급완료 기록</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. 모델별 상세 대사 테이블 (사용자 요청 14개 컬럼) */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden flex flex-col min-h-[400px]">
        {reconRows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <FileSpreadsheet size={48} className="text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-600">업로드된 에넥스 정산서가 없습니다.</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              상단의 [에넥스 정산서 업로드] 버튼을 눌러 정산 엑셀 파일을 업로드하시면 모델별 수수료 대사 및 검증이 즉시 진행됩니다.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 select-none shadow-2xs">
                <tr className="border-b border-slate-200 font-black text-[11px]">
                  <th className="py-2.5 px-2 text-center w-10">No</th>
                  <th className="py-2.5 px-2.5 text-center">계약번호</th>
                  <th className="py-2.5 px-2.5">판매점</th>
                  <th className="py-2.5 px-2.5 min-w-[200px]">제품명 (ERP / 정산서)</th>
                  <th className="py-2.5 px-2 text-center">배송일자</th>
                  <th className="py-2.5 px-2.5 text-right">매출액</th>
                  <th className="py-2.5 px-2 text-center">적용구좌</th>
                  <th className="py-2.5 px-2 text-center">금융수수료율</th>
                  <th className="py-2.5 px-2.5 text-right">구좌당공급가</th>
                  <th className="py-2.5 px-2.5 text-right">금융수수료</th>
                  <th className="py-2.5 px-2.5 text-right">공급가합계</th>
                  <th className="py-2.5 px-2.5 text-right">계산수수료</th>
                  <th className="py-2.5 px-2.5 text-right">에넥스수수료</th>
                  <th className="py-2.5 px-2.5 text-right">차액</th>
                  <th className="py-2.5 px-2.5 text-center">대조결과</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filteredRows.map((r, idx) => {
                  const isMatch = r.reconResult === '일치';
                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-50 transition-colors ${
                        !isMatch ? 'bg-rose-50/40' : r.isYellow ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="py-2 px-2 text-center text-slate-400 font-mono text-[10px]">
                        {idx + 1}
                      </td>

                      {/* 1. 계약번호 */}
                      <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {r.isYellow && (
                            <span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-200" title="A열 노란색 음영 (30% 요율)" />
                          )}
                          <span>{r.contractNo}</span>
                          {r.erpMatched && (
                            <span className="px-1 py-0.2 bg-emerald-100 text-emerald-800 text-[9px] font-bold rounded">
                              ERP
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. 판매점 */}
                      <td className="py-2 px-2.5 font-bold text-slate-700 whitespace-nowrap">
                        {r.branchOffice || '-'}
                      </td>

                      {/* 3. 제품명 */}
                      <td className="py-2 px-2.5 text-slate-800">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 line-clamp-1" title={r.prodName}>
                            {r.prodName}
                          </span>
                          {r.erpData && (
                            <span className="text-[10px] text-slate-400">
                              {r.erpData.memName} ({r.erpData.hq || '본부미지정'})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. 배송일자 */}
                      <td className="py-2 px-2 text-center font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {r.deliveryDate || '-'}
                      </td>

                      {/* 5. 매출액 */}
                      <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {r.salesAmount.toLocaleString()}원
                      </td>

                      {/* 6. 적용구좌 */}
                      <td className="py-2 px-2 text-center whitespace-nowrap">
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-bold">
                          {r.accountCount}구좌
                        </span>
                      </td>

                      {/* 7. 금융수수료율 (클릭 시 26% <-> 30% 토글) */}
                      <td className="py-2 px-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleFeeRate(idx)}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-black transition-all cursor-pointer border ${
                            r.feeRate === 0.30
                              ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                              : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                          }`}
                          title="클릭하여 금융수수료율(26% ↔ 30%)을 변경합니다."
                        >
                          {(r.feeRate * 100).toFixed(0)}%
                        </button>
                      </td>

                      {/* 8. 구좌당공급가 (드롭다운으로 55만, 75만, 80만 선택) */}
                      <td className="py-2 px-2.5 text-right whitespace-nowrap">
                        <select
                          value={r.unitSupplyPrice}
                          onChange={e => handleChangeSupplyPrice(idx, Number(e.target.value))}
                          className="px-1.5 py-0.5 text-right font-mono text-xs font-bold bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value={550000}>550,000원</option>
                          <option value={750000}>750,000원</option>
                          <option value={800000}>800,000원</option>
                        </select>
                      </td>

                      {/* 9. 금융수수료 */}
                      <td className="py-2 px-2.5 text-right font-mono text-slate-600 whitespace-nowrap">
                        {r.financialFee.toLocaleString()}원
                      </td>

                      {/* 10. 공급가합계 */}
                      <td className="py-2 px-2.5 text-right font-mono text-slate-600 whitespace-nowrap">
                        {r.totalSupplyPrice.toLocaleString()}원
                      </td>

                      {/* 11. 계산수수료 */}
                      <td className="py-2 px-2.5 text-right font-mono font-bold text-indigo-700 whitespace-nowrap">
                        {r.calculatedFee.toLocaleString()}원
                      </td>

                      {/* 12. 에넥스수수료 */}
                      <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {r.enexFee.toLocaleString()}원
                      </td>

                      {/* 13. 차액 */}
                      <td className="py-2 px-2.5 text-right font-mono font-black whitespace-nowrap">
                        {r.diff === 0 ? (
                          <span className="text-slate-400">0원</span>
                        ) : (
                          <span className={r.diff > 0 ? 'text-indigo-600' : 'text-rose-600'}>
                            {r.diff > 0 ? `+${r.diff.toLocaleString()}` : r.diff.toLocaleString()}원
                          </span>
                        )}
                      </td>

                      {/* 14. 대조결과 */}
                      <td className="py-2 px-2.5 text-center whitespace-nowrap">
                        {isMatch ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-black rounded-full inline-flex items-center gap-1 border border-emerald-200">
                            <Check size={11} />
                            일치
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[11px] font-black rounded-full inline-flex items-center gap-1 border border-rose-200">
                            <AlertTriangle size={11} />
                            확인필요
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* 하단 집계 행 */}
              <tfoot className="bg-slate-100 font-black text-slate-900 sticky bottom-0 z-10 border-t border-slate-300">
                <tr>
                  <td colSpan={4} className="py-2.5 px-3 text-center">
                    선택/필터 합계 ({stats.filteredCount.toLocaleString()}건)
                  </td>
                  <td className="py-2.5 px-2 text-center">-</td>
                  <td className="py-2.5 px-2.5 text-right font-mono">
                    {stats.filteredTotalSales.toLocaleString()}원
                  </td>
                  <td colSpan={2} className="py-2.5 px-2 text-center">-</td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-600">
                    -
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-600">
                    {stats.filteredTotalFinancialFee.toLocaleString()}원
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-600">
                    {stats.filteredTotalSupplyPrice.toLocaleString()}원
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-indigo-700">
                    {stats.filteredTotalCalculatedFee.toLocaleString()}원
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-slate-900">
                    {stats.filteredTotalEnexFee.toLocaleString()}원
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono">
                    <span className={stats.filteredTotalDiff === 0 ? 'text-slate-500' : 'text-rose-600'}>
                      {stats.filteredTotalDiff.toLocaleString()}원
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    {stats.filteredTotalDiff === 0 ? (
                      <span className="text-emerald-700 text-xs font-bold">100% 일치</span>
                    ) : (
                      <span className="text-rose-700 text-xs font-bold">차액발생</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* 4. 에넥스 지급완료 기록 모달 */}
      <AnimatePresence>
        {isRecordModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRecordModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10"
            >
              <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PackageCheck size={18} className="text-emerald-400" />
                  <h4 className="text-sm font-black">에넥스 지급완료 기록 및 관리대장 동기화</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="text-slate-400 hover:text-white cursor-pointer text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    정산 명칭 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={recordTitle}
                    onChange={e => setRecordTitle(e.target.value)}
                    placeholder="예: 2026년 10월 1차 (10/01~10/15) 에넥스 지급완료"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-indigo-500 font-bold outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      배송 시작일자
                    </label>
                    <input
                      type="date"
                      value={recordPeriodStart}
                      onChange={e => setRecordPeriodStart(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      배송 종료일자
                    </label>
                    <input
                      type="date"
                      value={recordPeriodEnd}
                      onChange={e => setRecordPeriodEnd(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    실제 에넥스 입금/지급일자
                  </label>
                  <input
                    type="date"
                    value={recordPayoutDate}
                    onChange={e => setRecordPayoutDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  />
                </div>

                {/* 요약 박스 */}
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 font-bold">지급완료 처리 대상 건수:</span>
                    <strong className="text-slate-900 font-mono text-sm">{filteredRows.length.toLocaleString()} 건</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 font-bold">총 결합 매출액:</span>
                    <strong className="text-slate-900 font-mono text-sm">{stats.filteredTotalSales.toLocaleString()} 원</strong>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-indigo-200/60">
                    <span className="text-indigo-900 font-black">에넥스 총 입금 수수료:</span>
                    <strong className="text-indigo-700 font-mono text-base font-black">
                      {stats.filteredTotalEnexFee.toLocaleString()} 원
                    </strong>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  💡 기록 시 구글 스프레드시트 <strong className="text-slate-700">`에넥스정산내역`</strong> 탭에 영구 보관되며,
                  월말 정산 시 기간별 총 입금액과 건수를 즉시 합산·조회할 수 있습니다.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettlementRecord}
                  disabled={isSavingRecord}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingRecord ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>저장 중...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={13} />
                      <span>지급완료 기록 저장</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. 지급완료 이력 모달 */}
      <AnimatePresence>
        {isHistoryModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-white w-full max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10"
            >
              <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <History size={18} className="text-indigo-400" />
                  <h4 className="text-sm font-black">에넥스 위탁판매 수수료 지급완료 이력</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="text-slate-400 hover:text-white cursor-pointer text-xs"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {isLoadingHistory ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-500" />
                    <span>이력을 불러오는 중입니다...</span>
                  </div>
                ) : historyList.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    <span>저장된 지급완료 이력이 없습니다.</span>
                  </div>
                ) : (
                  historyList.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-indigo-50/40 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-black rounded">
                              지급완료
                            </span>
                            <h5 className="text-sm font-black text-slate-900">{item.title}</h5>
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                            <span>배송기간: <strong>{item.periodStart || '시작일'} ~ {item.periodEnd || '종료일'}</strong></span>
                            <span>지급일: <strong>{item.payoutDate || '-'}</strong></span>
                            {item.worker && <span>등록자: {item.worker}</span>}
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs text-slate-500 block">총 {item.count.toLocaleString()}건</span>
                          <span className="text-base font-black text-indigo-700">
                            {item.totalEnexFee.toLocaleString()}원
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 shrink-0">
                <span>총 {historyList.length}건의 정산 지급완료 기록</span>
                <button
                  type="button"
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold cursor-pointer"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
