import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Search,
  User,
  ShieldCheck,
  CreditCard,
  Building2,
  Phone,
  Calendar,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  Copy,
  Check,
  Package,
  Info
} from 'lucide-react';

interface SangjoInquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface SangjoMember {
  rawRow: any[];
  memberNo: string;
  name: string;
  residentId: string;
  contractDate: string;
  status: string;
  productName: string;
  productDescription: string;
  totalAmount: number;
  contractInstallment: string;
  monthlyPayment: string;
  depositInstallment: string;
  depositAmount: number;
  balance: number;
  headquarters: string;
  branch: string;
  employee: string;
  employeeCode: string;
  phone: string;
  hasSpecialDiscount: boolean;
  discountedBalance: number;
}

export const SangjoInquiryModal: React.FC<SangjoInquiryModalProps> = ({ isOpen, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [allMembers, setAllMembers] = useState<SangjoMember[]>([]);
  const [productSpecs, setProductSpecs] = useState<Record<string, any[][]>>({});
  const [dataSource, setDataSource] = useState<string>('cache');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 검색 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SangjoMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<SangjoMember | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [copiedText, setCopiedText] = useState<string | null>(null);

  // 모달 오픈 시 데이터 로드
  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async (forceSync = false) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      if (forceSync) {
        await fetch('/api/sheets/unified-ledger/sync-from-sheet', { method: 'POST' });
      }

      const res = await fetch('/api/sheets/unified-ledger/data');
      if (!res.ok) {
        throw new Error('상조 원장 데이터를 불러오지 못했습니다.');
      }

      const json = await res.json();
      setDataSource(json.source || 'cache');

      if (json.productSpecs) {
        setProductSpecs(json.productSpecs);
      }

      if (json.data && Array.isArray(json.data) && json.data.length > 1) {
        const parsed = parseLedgerRows(json.data);
        setAllMembers(parsed);
        setDataLoaded(true);
      } else {
        setAllMembers([]);
        setDataLoaded(false);
      }
    } catch (err: any) {
      console.error('[SangjoInquiry] Load error:', err);
      setErrorMsg(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 계약원장 2차원 배열 파싱
  const parseLedgerRows = (rows: any[][]): SangjoMember[] => {
    if (!rows || rows.length < 2) return [];
    const headers = (rows[0] || []).map(h => String(h || '').trim());

    const findIdx = (keywords: string[]) => {
      return headers.findIndex(h =>
        keywords.some(k => h.replace(/\s+/g, '').toLowerCase().includes(k.replace(/\s+/g, '').toLowerCase()))
      );
    };

    const idxMemberNo = findIdx(['회원번호', '계약번호', '회원코드']);
    const idxName = findIdx(['회원명', '성명', '이름']);
    const idxResNo = findIdx(['주민등록번호', '주민번호']);
    const idxContractDate = findIdx(['계약일자', '가입일자']);
    const idxStatus = findIdx(['회원상태', '상태']);
    const idxProd = findIdx(['상품명']);
    const idxTotalAmt = findIdx(['상품총액', '총액']);
    const idxContractInst = findIdx(['계약회차']);
    const idxMonthlyPay = findIdx(['월불입액', '불입액']);
    const idxDepositInst = findIdx(['입금차', '납입회차', '입금회차']);
    const idxDepositAmt = findIdx(['입금액', '총입금액', '납입금액']);
    const idxHq = findIdx(['본부']);
    const idxBranch = findIdx(['지사']);
    const idxEmp = findIdx(['사원', '사원명', '담당사원']);
    const idxEmpCode = findIdx(['사원코드', '사원번호', '사번']);
    const idxPhone = findIdx(['핸드폰', '휴대폰', '연락처', '전화번호']);

    const list: SangjoMember[] = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const name = String(row[idxName !== -1 ? idxName : 5] || '').trim();
      const memberNo = String(row[idxMemberNo !== -1 ? idxMemberNo : 1] || '').trim();
      if (!name && !memberNo) continue;

      const residentId = String(row[idxResNo !== -1 ? idxResNo : 7] || '').trim();
      const contractDate = String(row[idxContractDate !== -1 ? idxContractDate : 2] || '').trim();
      const status = String(row[idxStatus !== -1 ? idxStatus : 8] || '').trim();
      const productName = String(row[idxProd !== -1 ? idxProd : 11] || '').trim();

      const rawTotalAmt = String(row[idxTotalAmt !== -1 ? idxTotalAmt : 12] || '').replace(/[^0-9.-]+/g, '');
      const rawDepositAmt = String(row[idxDepositAmt !== -1 ? idxDepositAmt : 16] || '').replace(/[^0-9.-]+/g, '');
      const totalAmount = parseFloat(rawTotalAmt) || 0;
      const depositAmount = parseFloat(rawDepositAmt) || 0;
      const balance = Math.max(0, totalAmount - depositAmount);

      const contractInstallment = String(row[idxContractInst !== -1 ? idxContractInst : 13] || '').trim();
      const monthlyPayment = String(row[idxMonthlyPay !== -1 ? idxMonthlyPay : 14] || '').trim();
      const depositInstallment = String(row[idxDepositInst !== -1 ? idxDepositInst : 15] || '').trim();

      const headquarters = String(row[idxHq !== -1 ? idxHq : 38] || '').trim();
      const branch = String(row[idxBranch !== -1 ? idxBranch : 9] || '').trim();
      const employee = String(row[idxEmp !== -1 ? idxEmp : 10] || '').trim();
      const employeeCode = String(row[idxEmpCode !== -1 ? idxEmpCode : 39] || '').trim();
      const phone = String(row[idxPhone !== -1 ? idxPhone : 27] || '').trim();

      const hasSpecialDiscount = false;
      const discountedBalance = balance;

      list.push({
        rawRow: row,
        memberNo,
        name,
        residentId,
        contractDate,
        status,
        productName,
        productDescription: getProductDescription(productName),
        totalAmount,
        contractInstallment,
        monthlyPayment,
        depositInstallment,
        depositAmount,
        balance,
        headquarters,
        branch,
        employee,
        employeeCode,
        phone,
        hasSpecialDiscount,
        discountedBalance
      });
    }

    return list;
  };

  const getProductDescription = (pName: string): string => {
    if (!pName) return '';
    if (pName.includes('하이브리드')) return '상조 서비스와 최신 프리미엄 라이프 케어가 결합된 고품격 종합 플랜';
    if (pName.includes('헬스케어')) return '고객 맞춤형 건강 관리 및 전문 헬스케어 혜택이 연계된 프리미엄 상조 상품';
    if (pName.includes('통신결합')) return '통신비 지원 및 실속형 상조 서비스가 하나로 결합된 혜택 플랜';
    if (pName.includes('라이즈')) return '새로운 시작과 보장을 함께 준비하는 합리적인 상조 멤버십';
    if (pName.includes('550') || pName.includes('480') || pName.includes('470')) return '정성과 예를 다하는 더좋은라이프 정통 프리미엄 의전 서비스';
    if (pName.includes('우림')) return '고품격 전통 장례 의전 및 안심 보장 우림 멤버십 플랜';
    return '더좋은라이프 맞춤형 프리미엄 상조 멤버십';
  };

  // 상품명에 따른 테마 그라데이션
  const getProductBadgeGradient = (pName: string) => {
    if (!pName) return 'from-slate-700 to-slate-900';
    if (pName.includes('하이브리드')) return 'from-blue-600 to-indigo-700';
    if (pName.includes('헬스케어')) return 'from-emerald-600 to-teal-700';
    if (pName.includes('통신결합')) return 'from-purple-600 to-pink-700';
    if (pName.includes('라이즈')) return 'from-orange-600 to-rose-700';
    if (pName.includes('550') || pName.includes('480') || pName.includes('470')) return 'from-slate-800 to-indigo-950';
    return 'from-blue-700 to-slate-900';
  };

  // 검색 실행
  const handleSearch = () => {
    const q = searchQuery.trim().replace(/-/g, '');
    if (!q) {
      setSearchResults([]);
      setSelectedMember(null);
      setHasSearched(false);
      return;
    }

    setHasSearched(true);
    const filtered = allMembers.filter(m => {
      const matchName = m.name.replace(/\s+/g, '').includes(q);
      const matchRes = m.residentId.replace(/[^0-9]/g, '').startsWith(q);
      const matchPhone = m.phone.replace(/[^0-9]/g, '').includes(q);
      const matchNo = m.memberNo.replace(/[^0-9]/g, '').includes(q);
      return matchName || matchRes || matchPhone || matchNo;
    });

    setSearchResults(filtered);
    if (filtered.length === 1) {
      setSelectedMember(filtered[0]);
    } else {
      setSelectedMember(null);
    }
  };

  // 클립보드 복사
  const handleCopy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };



  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl max-h-[92vh] bg-slate-50 text-slate-900 rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        
        {/* 상단 헤더 */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <CreditCard size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                  더좋은라이프 상조 회원 통합 조회
                </h3>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded-full border border-blue-200">
                  sangjo.netlify.app 통합
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                2008년~현재 전체 계약원장({allMembers.length.toLocaleString()}건) 기반 불입현황 및 가입상품 정보
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* 상태 뱃지 */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full border border-slate-200 text-xs font-bold text-slate-600">
              <span className={`w-2 h-2 rounded-full ${dataLoaded ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>{dataLoaded ? `실시간 고속 캐시 활성 (${dataSource})` : '데이터 로드 필요'}</span>
            </div>

            {/* 강제 새로고침 버튼 */}
            <button
              onClick={() => loadData(true)}
              disabled={isLoading}
              title="구글 시트 [통합원장] 최신 데이터로부터 캐시 강제 새로고침"
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin text-blue-600' : ''} />
            </button>

            {/* 닫기 버튼 */}
            <button
              onClick={onClose}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 메인 검색 및 바디 영역 */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">

          {/* 검색창 바 */}
          <div className="relative max-w-3xl mx-auto">
            <div className="relative flex items-center shadow-lg rounded-2xl overflow-hidden border border-slate-300 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-100 transition-all bg-white">
              <div className="pl-4 pr-2 text-slate-400">
                <Search size={20} />
              </div>
              <input
                type="text"
                placeholder="회원명, 주민번호(앞 6자리), 또는 연락처로 검색하세요 (예: 홍길동, 880805, 0101234)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="w-full py-3.5 pr-28 text-base font-semibold text-slate-800 placeholder-slate-400 bg-transparent outline-none"
              />
              <button
                onClick={handleSearch}
                disabled={isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? '검색 중...' : '검색'}
              </button>
            </div>
            <div className="flex items-center justify-center gap-3 mt-2 text-[11px] text-slate-400 font-bold">
              <span>빠른 검색:</span>
              <span className="px-2 py-0.5 bg-white rounded-md border border-slate-200 text-slate-600">성명</span>
              <span className="px-2 py-0.5 bg-white rounded-md border border-slate-200 text-slate-600">주민번호 앞 6자리</span>
              <span className="px-2 py-0.5 bg-white rounded-md border border-slate-200 text-slate-600">휴대폰 번호</span>
            </div>
          </div>

          {/* 에러 메시지 알림 */}
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                onClick={() => loadData(false)}
                className="px-3 py-1 bg-white hover:bg-rose-100 text-rose-700 font-bold rounded-lg border border-rose-300 transition-colors"
              >
                다시 시도
              </button>
            </div>
          )}

          {/* 1. 검색 전 초기 안내 화면 */}
          {!hasSearched && !selectedMember && (
            <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 shadow-xs max-w-2xl mx-auto space-y-6">
              <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto shadow-inner text-blue-600">
                <Search size={36} />
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-black text-slate-900">
                  회원 정보를 검색해 보세요
                </h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  2008년부터 축적된 전체 계약원장 데이터에서<br />
                  최신 계약 및 실시간 불입·수납 정보를 즉시 검색합니다.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full text-xs font-bold text-slate-600 border border-slate-200">
                <ShieldCheck size={14} className="text-emerald-600" />
                <span>총 {allMembers.length.toLocaleString()}명의 누적 회원 데이터 대기 중</span>
              </div>
            </div>
          )}

          {/* 2. 검색 결과가 없을 때 */}
          {hasSearched && searchResults.length === 0 && (
            <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 shadow-xs max-w-2xl mx-auto space-y-3">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
                <AlertCircle size={28} />
              </div>
              <p className="text-base font-black text-slate-700">일치하는 회원을 찾을 수 없습니다.</p>
              <p className="text-xs text-slate-400">회원명, 주민번호 앞자리, 또는 휴대폰 번호 입력을 다시 확인해 주세요.</p>
            </div>
          )}

          {/* 3. 복수 검색 결과 카드 그리드 */}
          {searchResults.length > 1 && !selectedMember && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider">
                  검색 결과 <span className="text-blue-600 font-black">{searchResults.length}건</span> (회원을 선택해 주세요)
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {searchResults.map((m, idx) => (
                  <motion.button
                    key={`${m.memberNo}-${idx}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    onClick={() => setSelectedMember(m)}
                    className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/5 transition-all text-left flex items-center justify-between group cursor-pointer"
                  >
                    <div className="space-y-1.5 flex-1 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-slate-900 group-hover:text-blue-600 transition-colors">
                          {m.name}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                          m.status === '정상' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                          m.status.includes('해약') || m.status.includes('해지') ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                          'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {m.status || '상태미상'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex flex-col gap-0.5">
                        <span className="font-mono text-slate-600">주민번호: {m.residentId || '-'}</span>
                        <span className="text-blue-600 font-semibold">{m.phone || '-'}</span>
                      </div>
                      <div className="pt-1 flex items-center gap-1.5">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded text-white bg-gradient-to-r ${getProductBadgeGradient(m.productName)}`}>
                          {m.productName || '미지정 상품'}
                        </span>
                        {m.contractDate && (
                          <span className="text-[10px] text-slate-400">
                            {m.contractDate}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                      <ChevronRight size={16} />
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* 4. 회원 상세 정보 뷰 (선택된 회원 1건) */}
          {selectedMember && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* 상단 바 (복수 결과 시 뒤로가기) */}
              {searchResults.length > 1 && (
                <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200">
                  <button
                    onClick={() => setSelectedMember(null)}
                    className="flex items-center gap-1.5 text-xs font-black text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                  >
                    <ArrowLeft size={14} />
                    <span>목록으로 돌아가기 (검색 결과 {searchResults.length}건)</span>
                  </button>
                  <span className="text-xs text-slate-400 font-mono">
                    회원번호 #{selectedMember.memberNo}
                  </span>
                </div>
              )}

              {/* 2컬럼 레이아웃: 좌측(인적사항 + 가입상품) / 우측(결제수납 다크카드 + 영업정보) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* 좌측 영역 (5컬럼) */}
                <div className="lg:col-span-5 space-y-6">

                  {/* 4-1. 기본 인적 사항 카드 */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2 text-blue-600">
                        <User size={18} />
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                          기본 인적 사항
                        </h4>
                      </div>
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 font-mono text-[11px] font-bold rounded-lg">
                        #{selectedMember.memberNo}
                      </span>
                    </div>

                    <div className="space-y-4">
                      {/* 성명 & 주민번호 */}
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 block mb-1">회원 성명</span>
                        <div className="flex items-baseline gap-3">
                          <span className="text-2xl font-black text-slate-900 tracking-tight">
                            {selectedMember.name}
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-500">
                            {selectedMember.residentId || '-'}
                          </span>
                        </div>
                      </div>

                      {/* 회원 상태 & 계약 일자 */}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <span className="text-[11px] font-bold text-slate-400 block mb-1">회원 상태</span>
                          <span className={`inline-block px-3 py-1 rounded-xl text-xs font-black ${
                            selectedMember.status === '정상' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            selectedMember.status.includes('해약') || selectedMember.status.includes('해지') ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                            'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {selectedMember.status || '미기재'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] font-bold text-slate-400 block mb-1">계약 일자</span>
                          <span className="text-sm font-black text-slate-800 flex items-center gap-1.5 mt-0.5">
                            <Calendar size={13} className="text-slate-400" />
                            {selectedMember.contractDate || '-'}
                          </span>
                        </div>
                      </div>

                      {/* 연락처 */}
                      <div className="pt-1">
                        <span className="text-[11px] font-bold text-slate-400 block mb-1">연락처 (휴대폰)</span>
                        <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                          <span className="text-sm font-bold text-blue-700 font-mono">
                            {selectedMember.phone || '-'}
                          </span>
                          {selectedMember.phone && (
                            <button
                              onClick={() => handleCopy(selectedMember.phone, 'phone')}
                              className="p-1 hover:bg-white rounded text-slate-400 hover:text-slate-700 transition-colors"
                              title="전화번호 복사"
                            >
                              {copiedText === 'phone' ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4-2. 가입 상품 정보 카드 */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2 text-blue-600">
                        <Package size={18} />
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                          가입 상품 정보
                        </h4>
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      {/* 상품명 */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-lg font-black px-3.5 py-1.5 rounded-xl text-white shadow-sm bg-gradient-to-r ${getProductBadgeGradient(selectedMember.productName)}`}>
                          {selectedMember.productName || '미지정 상품'}
                        </span>
                      </div>

                      {/* 상품 설명 */}
                      {selectedMember.productDescription && (
                        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 leading-relaxed font-medium">
                          {selectedMember.productDescription}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 우측 영역 (7컬럼) */}
                <div className="lg:col-span-7 space-y-6">

                  {/* 4-3. 결제 및 수납 현황 (다크 테마 프리미엄 카드) */}
                  <div className="bg-slate-950 rounded-3xl p-7 sm:p-8 text-white shadow-2xl border border-slate-800 relative overflow-hidden space-y-6">
                    {/* 은은한 배경 글로우 */}
                    <div className="absolute top-0 right-0 w-48 h-48 bg-blue-600/15 blur-[90px] rounded-full pointer-events-none" />

                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 relative z-10">
                      <div className="flex items-center gap-2 text-blue-400">
                        <CreditCard size={18} />
                        <h4 className="text-xs font-black uppercase tracking-wider text-blue-400">
                          결제 및 수납 현황
                        </h4>
                      </div>
                      <span className="px-2.5 py-1 bg-slate-800 text-slate-300 text-[10px] font-bold rounded-lg border border-slate-700">
                        VAT 포함
                      </span>
                    </div>

                    {/* 2x2 수납 스펙 그리드 */}
                    <div className="grid grid-cols-2 gap-y-6 gap-x-8 relative z-10">
                      <div>
                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">
                          상품 총액
                        </span>
                        <span className="text-2xl font-black text-white tracking-tight">
                          {selectedMember.totalAmount.toLocaleString()}원
                        </span>
                      </div>

                      <div>
                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">
                          월 불입액
                        </span>
                        <span className="text-2xl font-black text-white tracking-tight">
                          {selectedMember.monthlyPayment ? `${Number(selectedMember.monthlyPayment.replace(/[^0-9]/g, '') || 0).toLocaleString()}원` : '-'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">
                          계약 / 입금 회차
                        </span>
                        <div className="flex items-baseline gap-1 text-2xl font-black text-white">
                          <span>{selectedMember.contractInstallment || '-'}</span>
                          <span className="text-slate-500 text-lg">/</span>
                          <span className="text-blue-400">{selectedMember.depositInstallment || '0'}회</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">
                          총 입금액
                        </span>
                        <span className="text-2xl font-black text-blue-400 tracking-tight">
                          {selectedMember.depositAmount.toLocaleString()}원
                        </span>
                      </div>
                    </div>

                    {/* 하단 미납 잔액 강조 박스 */}
                    <div className="pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-end justify-between gap-4 relative z-10">
                      <div>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">
                          미납 잔액
                        </span>
                        <div className="text-4xl font-black text-white tracking-tight">
                          {selectedMember.balance.toLocaleString()}원
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4-4. 영업 관리 정보 카드 */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2 text-blue-600">
                        <Building2 size={18} />
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                          영업 관리 정보
                        </h4>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 block mb-1">소속 본부</span>
                        <span className="text-sm font-black text-slate-800">
                          {selectedMember.headquarters || '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 block mb-1">소속 지사</span>
                        <span className="text-sm font-black text-slate-800">
                          {selectedMember.branch || '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 block mb-1">담당 사원</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-black text-slate-900">
                            {selectedMember.employee || '-'}
                          </span>
                          {selectedMember.employeeCode && (
                            <span className="text-[10px] font-mono text-slate-400">
                              ({selectedMember.employeeCode})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>
          )}

        </div>

      </div>
    </div>
  );
};
