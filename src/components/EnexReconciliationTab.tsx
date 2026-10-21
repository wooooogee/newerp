import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  AlertCircle,
  Settings,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles
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

export type SupplyPriceType = 'PER_ACCOUNT' | 'PER_UNIT'; // 구좌당 vs 제품당

export interface EnexProductSupplyRule {
  id: string;
  prodName: string;            // 상조 상품명
  supplyPrice: number;         // 물품대금 (원)
  priceType: SupplyPriceType;  // 'PER_ACCOUNT'(구좌당) | 'PER_UNIT'(제품당)
  keywords: string[];          // 자동 매칭 키워드 (쉼표 구분)
  memo?: string;               // 비고
}

export interface EnexPolicySettings {
  baseFeeRate: number;      // 기본 금융수수료율 (기본: 0.26)
  yellowFeeRate: number;    // 음영(노란색) 금융수수료율 (기본: 0.30)
  productRules: EnexProductSupplyRule[];
}

export const DEFAULT_POLICY_SETTINGS: EnexPolicySettings = {
  baseFeeRate: 0.26,
  yellowFeeRate: 0.30,
  productRules: [
    {
      id: 'p_terawave',
      prodName: '테라웨이브',
      supplyPrice: 800000,
      priceType: 'PER_UNIT', // 구좌당이 아니라 제품당 80만원!
      keywords: ['테라웨이브', 'terawave'],
      memo: '구좌수 무관 제품당 80만원 고정'
    },
    { id: 'p6', prodName: '더좋은프리미엄540플러스', supplyPrice: 800000, priceType: 'PER_ACCOUNT', keywords: ['540+', '540플러스', '프리미엄540플러스', '프리미엄540+'], memo: '1구좌당 80만원' },
    { id: 'p7', prodName: '굿라이프헬스케어올인원', supplyPrice: 800000, priceType: 'PER_ACCOUNT', keywords: ['올인원', '헬스케어올인원'], memo: '1구좌당 80만원' },
    { id: 'p4', prodName: '더좋은프리미엄540', supplyPrice: 750000, priceType: 'PER_ACCOUNT', keywords: ['프리미엄540', '540'], memo: '1구좌당 75만원' },
    { id: 'p5', prodName: '굿라이프헬스케어골드', supplyPrice: 750000, priceType: 'PER_ACCOUNT', keywords: ['헬스케어골드', '골드'], memo: '1구좌당 75만원' },
    { id: 'p1', prodName: '더좋은하이브리드698', supplyPrice: 550000, priceType: 'PER_ACCOUNT', keywords: ['698', '하이브리드698', '하이브리드'], memo: '1구좌당 55만원' },
    { id: 'p2', prodName: '더좋은라이즈498', supplyPrice: 550000, priceType: 'PER_ACCOUNT', keywords: ['498', '라이즈498', '라이즈'], memo: '1구좌당 55만원' },
    { id: 'p3', prodName: '굿라이프헬스케어실버', supplyPrice: 550000, priceType: 'PER_ACCOUNT', keywords: ['헬스케어실버', '굿라이프실버'], memo: '1구좌당 55만원' }
  ]
};

export interface EnexReconciliationRow {
  contractNo: string;        // 1. 계약번호 (A열)
  branchOffice: string;      // 2. 판매점 (N열)
  sangjoProdName: string;    // 3. 상조 상품명 (ERP 가입상품명 or 키워드 유추 상조상품)
  applianceProdName: string; // 4. 제품명 (엑셀 D열 실제 가전제품명 원본)
  combineModel: string;      // 결합모델명 (엑셀 E열)
  customerName: string;      // 고객명 (ERP 매칭 시)
  hqName: string;            // 본부명 (ERP 매칭 시)
  deliveryDate: string;      // 5. 배송일자 (ERP 배송일자 or 엑셀 K열)
  salesAmount: number;       // 6. 매출액 (H열 결합매출액)
  accountCount: number;      // 7. 적용구좌 (Q열 또는 매출액 기반 1, 2, 3구좌)
  feeRate: number;           // 8. 금융수수료율 (기본 0.26, 노란색 음영이면 0.30)
  unitSupplyPrice: number;   // 9. 공급가 (물품대금)
  priceType: SupplyPriceType; // 적용 기준 ('PER_ACCOUNT' | 'PER_UNIT')
  financialFee: number;      // 10. 금융수수료 (매출액 * 금융수수료율)
  totalSupplyPrice: number;  // 11. 공급가합계 (구좌당공급가 * 적용구좌)
  calculatedFee: number;     // 12. 계산수수료 (매출액 - 금융수수료 - 공급가합계)
  enexFee: number;           // 13. 에넥스수수료 (O열 수수료 합계)
  diff: number;              // 14. 차액 (계산수수료 - 에넥스수수료)
  reconResult: '일치' | '확인필요'; // 15. 대조결과
  isYellow: boolean;         // 노란색 음영 여부
  erpMatched: boolean;       // 우리 ERP 데이터 매칭 여부
  erpData?: any;             // 매칭된 ERP 계약 원본
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

  // 정책 설정 상태 (금융수수료율 & 상품별 물품대금)
  const [policySettings, setPolicySettings] = useState<EnexPolicySettings>(() => {
    try {
      const stored = localStorage.getItem('erp_enex_policy_settings_v7');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.productRules)) {
          const tera = parsed.productRules.find((r: any) => r.id === 'p_terawave' || (r.prodName && r.prodName.includes('테라웨이브')));
          if (tera && tera.priceType === 'PER_UNIT') {
            return parsed;
          }
        }
      }
    } catch (e) {
      console.error('Failed to load enex policy settings', e);
    }
    return DEFAULT_POLICY_SETTINGS;
  });

  // 정책 설정 모달 상태
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState<boolean>(false);
  const [editingPolicy, setEditingPolicy] = useState<EnexPolicySettings>(policySettings);

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

  // 로컬 스토리지에서 지급완료 이력 로드
  const loadLocalSettlementHistory = (): EnexSettlementHistoryItem[] => {
    try {
      const stored = localStorage.getItem('erp_enex_settlements_v1');
      if (stored) return JSON.parse(stored);
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

  // 등록된 공급가 목록 (드롭다운 선택 옵션용)
  const availableSupplyPrices = useMemo(() => {
    const prices = new Set<number>();
    prices.add(550000);
    prices.add(750000);
    prices.add(800000);
    policySettings.productRules.forEach(r => {
      if (r.supplyPrice > 0) prices.add(r.supplyPrice);
    });
    return Array.from(prices).sort((a, b) => a - b);
  }, [policySettings]);

  // 구좌당 공급가 판정 헬퍼 (정책 설정 규칙 기반)
  const determineUnitSupplyPrice = (
    sangjoName: string,
    applianceName: string,
    modelName: string,
    sales: number,
    feeRate: number,
    enexFee: number,
    accountCount: number,
    rules: EnexProductSupplyRule[]
  ): { price: number; priceType: SupplyPriceType; matchedProdName: string } => {
    // [1순위 특수 제품]: 가전 제품명/모델명에 제품당 고정 단가(PER_UNIT: 테라웨이브 등) 키워드가 포함된 경우 상조 상품명과 무관하게 최우선 적용!
    const applianceClean = `${applianceName} ${modelName}`.replace(/\s+/g, '').toLowerCase();
    const perUnitRules = rules.filter(r => r.priceType === 'PER_UNIT');
    for (const rule of perUnitRules) {
      if (rule.keywords.some(k => applianceClean.includes(k.replace(/\s+/g, '').toLowerCase()))) {
        return {
          price: rule.supplyPrice,
          priceType: 'PER_UNIT',
          matchedProdName: rule.prodName
        };
      }
    }

    const combinedText = `${sangjoName} ${applianceName} ${modelName}`.replace(/\s+/g, '').toLowerCase();
    const hasPlus = combinedText.includes('540+') || combinedText.includes('540플러스') || combinedText.includes('플러스') || combinedText.includes('plus');

    // 키워드 길이 내림차순 정렬
    const allKeywordRules: Array<{ kw: string; rule: EnexProductSupplyRule }> = [];
    for (const rule of rules) {
      for (const kw of rule.keywords) {
        const cleanKw = kw.replace(/\s+/g, '').toLowerCase();
        if (cleanKw) {
          allKeywordRules.push({ kw: cleanKw, rule });
        }
      }
    }
    allKeywordRules.sort((a, b) => b.kw.length - a.kw.length);

    for (const item of allKeywordRules) {
      if (combinedText.includes(item.kw)) {
        if (hasPlus && (item.kw === '540' || item.kw === '프리미엄540')) {
          continue;
        }
        return {
          price: item.rule.supplyPrice,
          priceType: item.rule.priceType || 'PER_ACCOUNT',
          matchedProdName: item.rule.prodName
        };
      }
    }

    if (sangjoName) {
      const sClean = sangjoName.replace(/\s+/g, '').toLowerCase();
      for (const rule of rules) {
        if (sClean.includes(rule.prodName.replace(/\s+/g, '').toLowerCase())) {
          return {
            price: rule.supplyPrice,
            priceType: rule.priceType || 'PER_ACCOUNT',
            matchedProdName: rule.prodName
          };
        }
      }
    }

    // 역산 보조: 제품당 단가가 아닌 일반 구좌당 규칙 대상
    const regularRules = rules.filter(r => r.priceType !== 'PER_UNIT');
    if (sales > 0 && accountCount > 0 && regularRules.length > 0) {
      const estimatedSupplyTotal = sales - Math.round(sales * feeRate) - enexFee;
      const unitEst = estimatedSupplyTotal / accountCount;
      let bestRule = regularRules[0];
      let minDiff = Infinity;
      for (const rule of regularRules) {
        const diff = Math.abs(rule.supplyPrice - unitEst);
        if (diff < minDiff) {
          minDiff = diff;
          bestRule = rule;
        }
      }
      if (minDiff <= 60000 && bestRule) {
        return {
          price: bestRule.supplyPrice,
          priceType: 'PER_ACCOUNT',
          matchedProdName: bestRule.prodName
        };
      }
    }

    if (sales >= 2280000) {
      return { price: 800000, priceType: 'PER_ACCOUNT', matchedProdName: '더좋은프리미엄540플러스' };
    }
    return { price: 550000, priceType: 'PER_ACCOUNT', matchedProdName: '더좋은하이브리드698' };
  };

  // 단일 행 재계산 헬퍼
  const calculateRowMetrics = (
    sales: number,
    feeRate: number,
    unitPrice: number,
    accountCount: number,
    priceType: SupplyPriceType,
    enexFee: number
  ) => {
    const financialFee = Math.round(sales * feeRate);
    // 테라웨이브처럼 제품당 고정인 경우 구좌수를 곱하지 않고 단가 그대로 공급가에 반영
    const totalSupplyPrice = priceType === 'PER_UNIT' ? unitPrice : unitPrice * accountCount;
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

      for (let r = 0; r < Math.min(sheet1Rows.length, 3); r++) {
        const rowStr = sheet1Rows[r].join(' ');
        if (rowStr.includes('스마트렌탈') || rowStr.includes('수수료 정산서') || rowStr.includes('정산서')) {
          parsedSummary.title = (sheet1Rows[r][0] || sheet1Rows[r][1] || rowStr).trim();
          break;
        }
      }

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
      let detailSheetName = wb.SheetNames.length >= 3 ? wb.SheetNames[2] : wb.SheetNames[0];
      const foundDetailSheet = wb.SheetNames.find(s => s.includes('모델별상세') || s.includes('모델별') || s.includes('상세'));
      if (foundDetailSheet) {
        detailSheetName = foundDetailSheet;
      }
      const sheet3 = wb.Sheets[detailSheetName];

      const range = XLSX.utils.decode_range(sheet3['!ref'] || 'A1:Q1');
      const parsedReconRows: EnexReconciliationRow[] = [];

      let headerRowIdx = 1;
      for (let r = 0; r <= Math.min(range.e.r, 5); r++) {
        const cellA = sheet3[XLSX.utils.encode_cell({ r, c: 0 })];
        const valA = cellA ? String(cellA.v).replace(/\s+/g, '') : '';
        if (valA.includes('계약번호') || valA.includes('계약id')) {
          headerRowIdx = r;
          break;
        }
      }

      const getCell = (r: number, c: number) => sheet3[XLSX.utils.encode_cell({ r, c })];
      const getVal = (r: number, c: number) => {
        const cell = getCell(r, c);
        return cell ? cell.v : '';
      };

      for (let r = headerRowIdx + 1; r <= range.e.r; r++) {
        const cellA = getCell(r, 0); // A열 계약번호
        if (!cellA || cellA.v === undefined || cellA.v === null || String(cellA.v).trim() === '') {
          continue;
        }

        const contractNo = String(cellA.v).trim();
        if (contractNo.includes('합계') || contractNo.includes('소계') || contractNo.includes('계약번호')) {
          continue;
        }

        const salesAmount = Number(getVal(r, 7)) || 0; // H열 결합매출액
        const enexFee = Number(getVal(r, 14)) || 0;     // O열 수수료 합계
        const branchOffice = String(getVal(r, 13) || '').trim(); // N열 판매점
        const applianceProdName = String(getVal(r, 3) || '').trim(); // D열 가전 제품명 원본!
        const combineModel = String(getVal(r, 4) || '').trim();      // E열 결합모델명
        const deliveryDateExcel = String(getVal(r, 10) || '').trim(); // K열 배송일
        const remark = String(getVal(r, 16) || '').trim();           // Q열 비고

        // 구좌수 파악
        let accountCount = 1;
        if (remark.includes('2구좌') || salesAmount === 3960000 || salesAmount === 4560000) {
          accountCount = 2;
        } else if (remark.includes('3구좌') || salesAmount === 6840000) {
          accountCount = 3;
        } else if (remark.includes('1구좌')) {
          accountCount = 1;
        }

        // A열 노란색 음영 판별 (노란색이면 yellowFeeRate, 기본 baseFeeRate)
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

        let feeRate = isYellow ? policySettings.yellowFeeRate : policySettings.baseFeeRate;
        if (!isYellow && salesAmount > 0) {
          const diffYellow = Math.abs((salesAmount - Math.round(salesAmount * policySettings.yellowFeeRate)) - enexFee);
          const diffBase = Math.abs((salesAmount - Math.round(salesAmount * policySettings.baseFeeRate)) - enexFee);
          if (diffYellow % 50000 === 0 && diffBase % 50000 !== 0) {
            feeRate = policySettings.yellowFeeRate;
            isYellow = true;
          }
        }

        // [버그 수정 완료]: 유효한 렌탈계약번호(최소 4자리 이상)로 정확히 일치할 때만 ERP 매칭!
        const cleanContractNo = contractNo.trim();
        const matchedErp = erpData.find(d => {
          const rNo = String(d.rentalNo || '').trim();
          if (!rNo || rNo.length < 4) return false;
          return rNo === cleanContractNo;
        });

        // 상조 상품명 결정: ERP에 있으면 ERP prodName, 없으면 정책 규칙 및 키워드로 자동 배정
        let initialSangjoName = matchedErp?.prodName || '';
        const deliveryDate = matchedErp?.deliveryDate || deliveryDateExcel;
        const customerName = matchedErp?.memName || '';
        const hqName = matchedErp?.hq || '';

        // 구좌당 공급가 판정 (정책 설정 기반)
        const { price: unitSupplyPrice, priceType, matchedProdName } = determineUnitSupplyPrice(
          initialSangjoName,
          applianceProdName,
          combineModel,
          salesAmount,
          feeRate,
          enexFee,
          accountCount,
          policySettings.productRules
        );

        if (!initialSangjoName) {
          initialSangjoName = matchedProdName;
        }

        // 계산 산식
        const { financialFee, totalSupplyPrice, calculatedFee, diff, reconResult } = calculateRowMetrics(
          salesAmount,
          feeRate,
          unitSupplyPrice,
          accountCount,
          priceType,
          enexFee
        );

        parsedReconRows.push({
          contractNo,
          branchOffice,
          sangjoProdName: initialSangjoName,
          applianceProdName,
          combineModel,
          customerName,
          hqName,
          deliveryDate,
          salesAmount,
          accountCount,
          feeRate,
          unitSupplyPrice,
          priceType,
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

      if (parsedSummary.totalCount === 0) parsedSummary.totalCount = parsedReconRows.length;
      if (parsedSummary.totalSales === 0) parsedSummary.totalSales = parsedReconRows.reduce((sum, r) => sum + r.salesAmount, 0);
      if (parsedSummary.totalFee === 0) parsedSummary.totalFee = parsedReconRows.reduce((sum, r) => sum + r.enexFee, 0);

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

  // 정책 설정 저장 및 현재 대사 테이블 전체 재계산
  const handleSavePolicySettings = () => {
    // 유효성 검사
    if (editingPolicy.baseFeeRate <= 0 || editingPolicy.baseFeeRate > 1) {
      alert('기본 금융수수료율을 올바르게 입력해주세요 (예: 26% = 0.26)');
      return;
    }
    if (editingPolicy.yellowFeeRate <= 0 || editingPolicy.yellowFeeRate > 1) {
      alert('노란색 음영 금융수수료율을 올바르게 입력해주세요 (예: 30% = 0.30)');
      return;
    }

    try {
      localStorage.setItem('erp_enex_policy_settings_v7', JSON.stringify(editingPolicy));
      setPolicySettings(editingPolicy);

      // 현재 테이블에 올라와 있는 데이터 전체에 새 정책 즉시 재계산 반영!
      if (reconRows.length > 0) {
        setReconRows(prev => {
          return prev.map(row => {
            const newFeeRate = row.isYellow ? editingPolicy.yellowFeeRate : editingPolicy.baseFeeRate;
            const { price: newUnitPrice, priceType: newPriceType, matchedProdName } = determineUnitSupplyPrice(
              row.sangjoProdName,
              row.applianceProdName,
              row.combineModel,
              row.salesAmount,
              newFeeRate,
              row.enexFee,
              row.accountCount,
              editingPolicy.productRules
            );
            const metrics = calculateRowMetrics(
              row.salesAmount,
              newFeeRate,
              newUnitPrice,
              row.accountCount,
              newPriceType,
              row.enexFee
            );
            return {
              ...row,
              feeRate: newFeeRate,
              unitSupplyPrice: newUnitPrice,
              priceType: newPriceType,
              sangjoProdName: row.sangjoProdName || matchedProdName,
              ...metrics
            };
          });
        });
      }

      alert('✅ 수수료율 및 물품대금 정책이 저장되었으며, 대사 테이블에 즉시 반영되었습니다!');
      setIsPolicyModalOpen(false);
    } catch (e: any) {
      alert('정책 저장 중 오류가 발생했습니다: ' + e.message);
    }
  };

  // 정책 모달 열기
  const handleOpenPolicyModal = () => {
    setEditingPolicy(JSON.parse(JSON.stringify(policySettings)));
    setIsPolicyModalOpen(true);
  };

  // 정책 모달에서 새 상품 행 추가
  const handleAddProductRule = () => {
    const newRule: EnexProductSupplyRule = {
      id: 'rule_' + Date.now(),
      prodName: '신규상품',
      supplyPrice: 800000,
      priceType: 'PER_ACCOUNT',
      keywords: ['신규키워드'],
      memo: '신규 등록 상품'
    };
    setEditingPolicy(prev => ({
      ...prev,
      productRules: [...prev.productRules, newRule]
    }));
  };

  // 정책 모달에서 상품 삭제
  const handleRemoveProductRule = (id: string) => {
    setEditingPolicy(prev => ({
      ...prev,
      productRules: prev.productRules.filter(r => r.id !== id)
    }));
  };

  // 정책 기본값으로 리셋
  const handleResetToDefaultPolicy = () => {
    if (window.confirm('모든 수수료율 및 상품별 물품대금을 기본 설정(26%/30%, 55만/75만/80만)으로 복원하시겠습니까?')) {
      setEditingPolicy(JSON.parse(JSON.stringify(DEFAULT_POLICY_SETTINGS)));
    }
  };

  // 행별 금융수수료율 토글 (26% <-> 30%)
  const handleToggleFeeRate = (idx: number) => {
    setReconRows(prev => {
      const copy = [...prev];
      const row = { ...copy[idx] };
      const newRate = row.feeRate === policySettings.baseFeeRate ? policySettings.yellowFeeRate : policySettings.baseFeeRate;
      row.feeRate = newRate;
      row.isYellow = newRate === policySettings.yellowFeeRate;
      const metrics = calculateRowMetrics(
        row.salesAmount,
        newRate,
        row.unitSupplyPrice,
        row.accountCount,
        row.priceType || 'PER_ACCOUNT',
        row.enexFee
      );
      Object.assign(row, metrics);
      copy[idx] = row;
      return copy;
    });
  };

  // 행별 구좌당공급가 변경
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
        row.priceType || 'PER_ACCOUNT',
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
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchContract = row.contractNo.toLowerCase().includes(term);
        const matchBranch = row.branchOffice.toLowerCase().includes(term);
        const matchSangjo = row.sangjoProdName.toLowerCase().includes(term);
        const matchAppliance = row.applianceProdName.toLowerCase().includes(term);
        const matchCust = row.customerName.toLowerCase().includes(term);
        const matchHq = row.hqName.toLowerCase().includes(term);
        if (!matchContract && !matchBranch && !matchSangjo && !matchAppliance && !matchCust && !matchHq) {
          return false;
        }
      }

      if (filterResult === 'MATCH' && row.reconResult !== '일치') return false;
      if (filterResult === 'MISMATCH' && row.reconResult !== '확인필요') return false;

      if (filterRate === '26' && row.feeRate !== policySettings.baseFeeRate) return false;
      if (filterRate === '30' && row.feeRate !== policySettings.yellowFeeRate) return false;

      if (filterDateStart && row.deliveryDate && row.deliveryDate < filterDateStart) return false;
      if (filterDateEnd && row.deliveryDate && row.deliveryDate > filterDateEnd) return false;

      return true;
    });
  }, [reconRows, searchTerm, filterResult, filterRate, filterDateStart, filterDateEnd, policySettings]);

  // 대사 통계 집계
  const stats = useMemo(() => {
    const totalCount = reconRows.length;
    const matchCount = reconRows.filter(r => r.reconResult === '일치').length;
    const mismatchCount = totalCount - matchCount;

    const rate26Count = reconRows.filter(r => r.feeRate === policySettings.baseFeeRate).length;
    const rate30Count = reconRows.filter(r => r.feeRate === policySettings.yellowFeeRate).length;

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
  }, [reconRows, filteredRows, policySettings]);

  // 대사 결과 엑셀 내보내기 (수식 & 서식 완벽 적용)
  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      alert('내보낼 대사 데이터가 없습니다.');
      return;
    }

    try {
      const wb = XLSX.utils.book_new();

      const headers = [
        '계약번호',
        '판매점',
        '상품명(상조)',
        '제품명(가전)',
        '고객명',
        '본부명',
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
        '대조결과'
      ];

      const wsData: any[][] = [headers];

      filteredRows.forEach((r, idx) => {
        const rowNum = idx + 2; // 엑셀 행 번호 (1-based, 1행 헤더)
        // H: 매출액, I: 적용구좌, J: 금융수수료율, K: 구좌당공급가, L: 금융수수료, M: 공급가합계, N: 계산수수료, O: 에넥스수수료, P: 차액, Q: 대조결과
        wsData.push([
          r.contractNo,
          r.branchOffice,
          r.sangjoProdName,
          r.applianceProdName,
          r.customerName,
          r.hqName,
          r.deliveryDate,
          { t: 'n', v: r.salesAmount, z: '#,##0' },
          { t: 'n', v: r.accountCount, z: '#,##0' },
          { t: 'n', v: r.feeRate, z: '0.0%' },
          { t: 'n', v: r.unitSupplyPrice, z: '#,##0' },
          // 금융수수료 수식: ROUND(매출액 * 금융수수료율, 0)
          { t: 'n', f: `ROUND(H${rowNum}*J${rowNum}, 0)`, v: r.financialFee, z: '#,##0' },
          // 공급가합계 수식: 구좌당공급가 * 적용구좌
          { t: 'n', f: r.priceType === 'PER_UNIT' ? `K${rowNum}` : `K${rowNum}*I${rowNum}`, v: r.totalSupplyPrice, z: '#,##0' },
          // 계산수수료 수식: 매출액 - 금융수수료 - 공급가합계
          { t: 'n', f: `H${rowNum}-L${rowNum}-M${rowNum}`, v: r.calculatedFee, z: '#,##0' },
          // 에넥스수수료
          { t: 'n', v: r.enexFee, z: '#,##0' },
          // 차액 수식: 계산수수료 - 에넥스수수료
          { t: 'n', f: `N${rowNum}-O${rowNum}`, v: r.diff, z: '#,##0' },
          // 대조결과 수식: IF(차액=0, "일치", "확인필요")
          { t: 's', f: `IF(P${rowNum}=0, "일치", "확인필요")`, v: r.reconResult }
        ]);
      });

      const totalRowNum = filteredRows.length + 2;
      wsData.push([
        '합계',
        '',
        '',
        '',
        '',
        '',
        '',
        { t: 'n', f: `SUM(H2:H${totalRowNum - 1})`, v: stats.filteredTotalSales, z: '#,##0' },
        '',
        '',
        '',
        { t: 'n', f: `SUM(L2:L${totalRowNum - 1})`, v: stats.filteredTotalFinancialFee, z: '#,##0' },
        { t: 'n', f: `SUM(M2:M${totalRowNum - 1})`, v: stats.filteredTotalSupplyPrice, z: '#,##0' },
        { t: 'n', f: `SUM(N2:N${totalRowNum - 1})`, v: stats.filteredTotalCalculatedFee, z: '#,##0' },
        { t: 'n', f: `SUM(O2:O${totalRowNum - 1})`, v: stats.filteredTotalEnexFee, z: '#,##0' },
        { t: 'n', f: `SUM(P2:P${totalRowNum - 1})`, v: stats.filteredTotalDiff, z: '#,##0' },
        ''
      ]);

      const ws = XLSX.utils.aoa_to_sheet(wsData);

      ws['!cols'] = [
        { wch: 13 }, // 계약번호
        { wch: 16 }, // 판매점
        { wch: 22 }, // 상품명(상조)
        { wch: 32 }, // 제품명(가전)
        { wch: 10 }, // 고객명
        { wch: 12 }, // 본부명
        { wch: 12 }, // 배송일자
        { wch: 14 }, // 매출액
        { wch: 9 },  // 적용구좌
        { wch: 12 }, // 금융수수료율
        { wch: 13 }, // 구좌당공급가
        { wch: 13 }, // 금융수수료
        { wch: 13 }, // 공급가합계
        { wch: 13 }, // 계산수수료
        { wch: 13 }, // 에넥스수수료
        { wch: 12 }, // 차액
        { wch: 10 }  // 대조결과
      ];

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
      const rowsToSave = filteredRows.map(r => [
        r.contractNo,
        r.branchOffice,
        `${r.sangjoProdName} / ${r.applianceProdName}`,
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
        r.customerName,
        r.hqName
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

  // 지급완료 이력 불러오기
  const handleOpenHistoryModal = async () => {
    setIsHistoryModalOpen(true);
    setIsLoadingHistory(true);

    try {
      const localList = loadLocalSettlementHistory();
      setHistoryList(localList);

      const res = await fetch('/api/sheets/enex-settlements');
      if (res.ok) {
        const data = await res.json();
        if (data.list && Array.isArray(data.list) && data.list.length > 0) {
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
    <div className="flex flex-col h-full space-y-3.5">
      {/* 1. 상단 파일 업로드 및 정산서 요약 영역 */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-2xs">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 mb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-black rounded-md">
                에넥스 정산 대사 엔진
              </span>
              <h4 className="text-base font-black text-slate-800">
                에넥스 스마트렌탈 위탁판매 수수료 정산서 대사
              </h4>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Sheet 1(총매출·수수료)과 Sheet 3(모델별상세)를 파싱하여 가전 제품명과 상조 상품명을 분리하고, 설정된 금융수수료율 및 물품대금으로 정확하게 대사합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* 정책 설정 버튼 */}
            <button
              type="button"
              onClick={handleOpenPolicyModal}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
              title="금융수수료율(26%/30%) 및 상품별 1구좌당 물품대금 자체 설정"
            >
              <Settings size={14} className="text-indigo-600" />
              <span>수수료율 & 물품대금 정책 설정</span>
            </button>

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
          <div className="mt-2.5 pt-2.5 border-t border-slate-200/80">
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

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-bold text-slate-500 block">실적 (총 건수)</span>
                <span className="text-sm font-black text-slate-800">{summaryData.totalCount.toLocaleString()} 건</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-bold text-slate-500 block">총 매출금액</span>
                <span className="text-sm font-black text-slate-800">{summaryData.totalSales.toLocaleString()} 원</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-bold text-slate-500 block">기본수수료</span>
                <span className="text-sm font-black text-indigo-700">{summaryData.basicFee.toLocaleString()} 원</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-bold text-slate-500 block">환수수수료</span>
                <span className={`text-sm font-black ${summaryData.refundFee < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                  {summaryData.refundFee.toLocaleString()} 원
                </span>
              </div>
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-2 rounded-xl border border-indigo-200 shadow-2xs">
                <span className="text-[10px] font-black text-indigo-900 block">수수료 합계 (입금액)</span>
                <span className="text-sm font-black text-indigo-900">{summaryData.totalFee.toLocaleString()} 원</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. 필터 및 컨트롤 툴바 */}
      {reconRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* 검색창 */}
            <div className="relative w-48 sm:w-56">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="계약번호/제품명/상품명/고객"
                className="w-full pl-8 pr-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
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
                {(policySettings.baseFeeRate * 100).toFixed(0)}% ({stats.rate26Count})
              </button>
              <button
                type="button"
                onClick={() => setFilterRate('30')}
                className={`px-2 py-1 rounded-lg cursor-pointer ${filterRate === '30' ? 'bg-amber-400 text-amber-950 shadow-2xs' : 'text-slate-500'}`}
              >
                {(policySettings.yellowFeeRate * 100).toFixed(0)}% (노랑 {stats.rate30Count})
              </button>
            </div>

            {/* 배송일자 필터 */}
            <div className="flex items-center gap-1 text-xs text-slate-600">
              <Calendar size={13} className="text-slate-400" />
              <input
                type="date"
                value={filterDateStart}
                onChange={e => setFilterDateStart(e.target.value)}
                className="px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
              <span>~</span>
              <input
                type="date"
                value={filterDateEnd}
                onChange={e => setFilterDateEnd(e.target.value)}
                className="px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
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
              title="에넥스 지급완료 기록으로 저장"
            >
              <Save size={13} />
              <span>에넥스 지급완료 기록</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. 모델별 상세 대사 테이블 (전체값이 한눈에 들어오는 와이드 테이블) */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden flex flex-col min-h-[460px]">
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
                <tr className="border-b border-slate-200 font-black text-[11px] whitespace-nowrap">
                  <th className="py-2 px-1.5 text-center w-8">No</th>
                  <th className="py-2 px-2 text-center">계약번호</th>
                  <th className="py-2 px-2">판매점</th>
                  <th className="py-2 px-2.5 min-w-[130px]">상품명 (상조)</th>
                  <th className="py-2 px-2.5 min-w-[220px]">제품명 (가전 모델)</th>
                  <th className="py-2 px-2 text-center">고객/본부</th>
                  <th className="py-2 px-2 text-center">배송일자</th>
                  <th className="py-2 px-2 text-right">매출액</th>
                  <th className="py-2 px-1 text-center">구좌</th>
                  <th className="py-2 px-1.5 text-center">금융수수료율</th>
                  <th className="py-2 px-2 text-right">구좌당공급가</th>
                  <th className="py-2 px-2 text-right">금융수수료</th>
                  <th className="py-2 px-2 text-right">공급가합계</th>
                  <th className="py-2 px-2 text-right">계산수수료</th>
                  <th className="py-2 px-2 text-right">에넥스수수료</th>
                  <th className="py-2 px-2 text-right">차액</th>
                  <th className="py-2 px-2 text-center">대조결과</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filteredRows.map((r, idx) => {
                  const isMatch = r.reconResult === '일치';
                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-50 transition-colors ${
                        !isMatch ? 'bg-rose-50/50' : r.isYellow ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="py-1.5 px-1.5 text-center text-slate-400 font-mono text-[10px]">
                        {idx + 1}
                      </td>

                      {/* 1. 계약번호 */}
                      <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-900 whitespace-nowrap">
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
                      <td className="py-1.5 px-2 font-bold text-slate-700 whitespace-nowrap text-[11px]">
                        {r.branchOffice || '-'}
                      </td>

                      {/* 3. 상품명 (상조) */}
                      <td className="py-1.5 px-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded text-[11px] border border-indigo-100">
                            {r.sangjoProdName || '미지정'}
                          </span>
                          {r.priceType === 'PER_UNIT' && (
                            <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 font-black text-[9px] rounded border border-blue-200" title="구좌당이 아닌 제품 1대당 물품대금 적용">
                              제품당
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. 제품명 (실제 가전 모델 원본) */}
                      <td className="py-1.5 px-2.5 text-slate-900">
                        <div className="flex flex-col">
                          <span className="font-bold line-clamp-1" title={r.applianceProdName}>
                            {r.applianceProdName || '-'}
                          </span>
                          {r.combineModel && r.combineModel !== r.applianceProdName && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {r.combineModel}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. 고객명 / 본부 (ERP) */}
                      <td className="py-1.5 px-2 text-center whitespace-nowrap text-[11px]">
                        {r.customerName ? (
                          <div className="flex flex-col items-center">
                            <span className="font-bold text-slate-800">{r.customerName}</span>
                            <span className="text-[10px] text-slate-400">{r.hqName || '-'}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* 6. 배송일자 */}
                      <td className="py-1.5 px-2 text-center font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {r.deliveryDate || '-'}
                      </td>

                      {/* 7. 매출액 */}
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {r.salesAmount.toLocaleString()}원
                      </td>

                      {/* 8. 적용구좌 */}
                      <td className="py-1.5 px-1 text-center whitespace-nowrap">
                        <span className="px-1 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold">
                          {r.accountCount}구좌
                        </span>
                      </td>

                      {/* 9. 금융수수료율 (클릭 시 26% <-> 30% 토글) */}
                      <td className="py-1.5 px-1.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleFeeRate(idx)}
                          className={`px-1.5 py-0.5 rounded text-[11px] font-black transition-all cursor-pointer border ${
                            r.feeRate === policySettings.yellowFeeRate
                              ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                              : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                          }`}
                          title="클릭하여 금융수수료율(26% ↔ 30%)을 토글합니다."
                        >
                          {(r.feeRate * 100).toFixed(0)}%
                        </button>
                      </td>

                      {/* 10. 구좌당공급가 (드롭다운으로 등록된 단가 선택) */}
                      <td className="py-1.5 px-2 text-right whitespace-nowrap">
                        <select
                          value={r.unitSupplyPrice}
                          onChange={e => handleChangeSupplyPrice(idx, Number(e.target.value))}
                          className="px-1 py-0.5 text-right font-mono text-xs font-bold bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          {availableSupplyPrices.map(p => (
                            <option key={p} value={p}>
                              {p.toLocaleString()}원
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* 11. 금융수수료 */}
                      <td className="py-1.5 px-2 text-right font-mono text-slate-600 whitespace-nowrap">
                        {r.financialFee.toLocaleString()}원
                      </td>

                      {/* 12. 공급가합계 */}
                      <td className="py-1.5 px-2 text-right font-mono text-slate-600 whitespace-nowrap">
                        {r.totalSupplyPrice.toLocaleString()}원
                      </td>

                      {/* 13. 계산수수료 */}
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-indigo-700 whitespace-nowrap">
                        {r.calculatedFee.toLocaleString()}원
                      </td>

                      {/* 14. 에넥스수수료 */}
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {r.enexFee.toLocaleString()}원
                      </td>

                      {/* 15. 차액 */}
                      <td className="py-1.5 px-2 text-right font-mono font-black whitespace-nowrap">
                        {r.diff === 0 ? (
                          <span className="text-slate-400">0원</span>
                        ) : (
                          <span className={r.diff > 0 ? 'text-indigo-600' : 'text-rose-600'}>
                            {r.diff > 0 ? `+${r.diff.toLocaleString()}` : r.diff.toLocaleString()}원
                          </span>
                        )}
                      </td>

                      {/* 16. 대조결과 */}
                      <td className="py-1.5 px-2 text-center whitespace-nowrap">
                        {isMatch ? (
                          <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded inline-flex items-center gap-0.5 border border-emerald-200">
                            <Check size={10} />
                            일치
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-black rounded inline-flex items-center gap-0.5 border border-rose-200">
                            <AlertTriangle size={10} />
                            확인필요
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* 하단 집계 행 */}
              <tfoot className="bg-slate-100 font-black text-slate-900 sticky bottom-0 z-10 border-t border-slate-300 whitespace-nowrap">
                <tr>
                  <td colSpan={7} className="py-2 px-3 text-center">
                    합계 ({stats.filteredCount.toLocaleString()}건)
                  </td>
                  <td className="py-2 px-2 text-right font-mono">
                    {stats.filteredTotalSales.toLocaleString()}원
                  </td>
                  <td colSpan={3} className="py-2 px-1 text-center">-</td>
                  <td className="py-2 px-2 text-right font-mono text-slate-600">
                    {stats.filteredTotalFinancialFee.toLocaleString()}원
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-slate-600">
                    {stats.filteredTotalSupplyPrice.toLocaleString()}원
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-indigo-700">
                    {stats.filteredTotalCalculatedFee.toLocaleString()}원
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-slate-900">
                    {stats.filteredTotalEnexFee.toLocaleString()}원
                  </td>
                  <td className="py-2 px-2 text-right font-mono">
                    <span className={stats.filteredTotalDiff === 0 ? 'text-slate-500' : 'text-rose-600'}>
                      {stats.filteredTotalDiff.toLocaleString()}원
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center">
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

      {/* 4. [설정 모달]: 금융수수료율 & 상품별 구좌당 물품대금 설정 창 */}
      <AnimatePresence>
        {isPolicyModalOpen && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPolicyModalOpen(false)}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative bg-white w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10 border border-slate-100"
            >
              {/* 모달 헤더 */}
              <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-400/30">
                    <Settings size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black">에넥스 금융수수료율 & 상품별 물품대금 자체 설정</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      금융사 수수료율 변경 및 상품 추가 시 여기서 직접 수정하면 대사작업에 즉시 자동 반영됩니다.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPolicyModalOpen(false)}
                  className="text-slate-400 hover:text-white cursor-pointer p-1 rounded-lg"
                >
                  ✕
                </button>
              </div>

              {/* 모달 본문 */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
                {/* 1) 금융수수료율 설정 카드 */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Percent size={15} className="text-indigo-600" />
                      <h5 className="text-xs font-black text-slate-800">1. 금융사 수수료율 기준 설정</h5>
                    </div>
                    <span className="text-[11px] text-slate-400">정산서 결합매출액(H열)에 곱해지는 공제 요율</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                      <label className="block font-bold text-slate-700 mb-1">
                        일반 기본 수수료율 (기본 반영)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={(editingPolicy.baseFeeRate * 100).toFixed(1)}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            setEditingPolicy(prev => ({ ...prev, baseFeeRate: val / 100 }));
                          }}
                          className="w-24 px-2 py-1.5 font-mono font-black text-base text-center bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                        <span className="font-bold text-slate-700 text-sm">%</span>
                        <span className="text-[11px] text-slate-400 ml-auto">A열 음영 없는 일반 계약</span>
                      </div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                      <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-200" />
                        A열 노란색 음영 수수료율
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={(editingPolicy.yellowFeeRate * 100).toFixed(1)}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            setEditingPolicy(prev => ({ ...prev, yellowFeeRate: val / 100 }));
                          }}
                          className="w-24 px-2 py-1.5 font-mono font-black text-base text-center bg-amber-50 border border-amber-300 rounded-lg focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none text-amber-950"
                        />
                        <span className="font-bold text-slate-700 text-sm">%</span>
                        <span className="text-[11px] text-slate-400 ml-auto">정산서 A열 노랑 음영 적용</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2) 상품별 1구좌당 물품대금(공급가) 설정 테이블 */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <DollarSign size={15} className="text-emerald-600" />
                      <h5 className="text-xs font-black text-slate-800">2. 상품별 구좌당 물품대금 (공급가) 설정</h5>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddProductRule}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={12} />
                      <span>새 상품 추가</span>
                    </button>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100/80 text-slate-700 font-black border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-2.5 w-1/4">상품명</th>
                          <th className="py-2 px-2.5 w-1/5">물품대금 공급가(원)</th>
                          <th className="py-2 px-2.5 w-1/5 text-indigo-700">적용 기준</th>
                          <th className="py-2 px-2.5 w-1/4">자동인식 키워드</th>
                          <th className="py-2 px-1 text-center w-10">삭제</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                        {editingPolicy.productRules.map((rule, idx) => (
                          <tr key={rule.id || idx} className="hover:bg-slate-50">
                            <td className="py-1.5 px-3">
                              <input
                                type="text"
                                value={rule.prodName}
                                onChange={e => {
                                  const val = e.target.value;
                                  setEditingPolicy(prev => {
                                    const copy = [...prev.productRules];
                                    copy[idx] = { ...copy[idx], prodName: val };
                                    return { ...prev, productRules: copy };
                                  });
                                }}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-bold text-xs"
                              />
                            </td>
                            <td className="py-1.5 px-2.5">
                              <input
                                type="number"
                                step="10000"
                                value={rule.supplyPrice}
                                onChange={e => {
                                  const val = parseInt(e.target.value, 10) || 0;
                                  setEditingPolicy(prev => {
                                    const copy = [...prev.productRules];
                                    copy[idx] = { ...copy[idx], supplyPrice: val };
                                    return { ...prev, productRules: copy };
                                  });
                                }}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono font-bold text-xs text-right"
                              />
                            </td>
                            <td className="py-1.5 px-2.5">
                              <select
                                value={rule.priceType || 'PER_ACCOUNT'}
                                onChange={e => {
                                  const val = e.target.value as SupplyPriceType;
                                  setEditingPolicy(prev => {
                                    const copy = [...prev.productRules];
                                    copy[idx] = { ...copy[idx], priceType: val };
                                    return { ...prev, productRules: copy };
                                  });
                                }}
                                className="w-full px-2 py-1 bg-indigo-50/50 border border-indigo-200 rounded font-bold text-xs text-indigo-800"
                              >
                                <option value="PER_ACCOUNT">구좌당</option>
                                <option value="PER_UNIT">제품당 (고정)</option>
                              </select>
                            </td>
                            <td className="py-1.5 px-2.5">
                              <input
                                type="text"
                                value={rule.keywords.join(', ')}
                                onChange={e => {
                                  const val = e.target.value.split(',').map(k => k.trim()).filter(Boolean);
                                  setEditingPolicy(prev => {
                                    const copy = [...prev.productRules];
                                    copy[idx] = { ...copy[idx], keywords: val };
                                    return { ...prev, productRules: copy };
                                  });
                                }}
                                placeholder="예: 540+, 540플러스"
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-600 text-xs"
                              />
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveProductRule(rule.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                title="이 상품 정책 삭제"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    💡 정산서 업로드 시 결합모델명(E열)이나 가전명(D열)에 위 키워드가 포함되어 있으면 해당 물품대금이 자동 적용됩니다.
                  </p>
                </div>
              </div>

              {/* 모달 푸터 */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={handleResetToDefaultPolicy}
                  className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw size={12} />
                  <span>기본 정책으로 복원</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPolicyModalOpen(false)}
                    className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePolicySettings}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs shadow-md shadow-indigo-500/20 flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle size={14} />
                    <span>설정 저장 및 정산 대사에 즉시 반영</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. 에넥스 지급완료 기록 모달 */}
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

      {/* 6. 지급완료 이력 모달 */}
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
