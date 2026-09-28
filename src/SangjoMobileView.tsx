import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  User,
  Phone,
  Calendar,
  CreditCard,
  Building2,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  LogOut,
  Copy,
  Check,
  Package,
  ShieldCheck,
  AlertCircle,
  X,
  PhoneCall,
  Info
} from 'lucide-react';
import { SangjoMember } from './SangjoInquiryModal';

interface SangjoMobileViewProps {
  currentUser: any;
  onLogout: () => Promise<void>;
}

export const SangjoMobileView: React.FC<SangjoMobileViewProps> = ({ currentUser, onLogout }) => {
  const [isLoading, setIsLoading] = useState(false);
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
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (forceSync = false) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      if (forceSync) {
        await fetch('/api/sheets/unified-ledger/sync-from-sheet', { method: 'POST' });
      }

      const res = await fetch('/api/sheets/unified-ledger/data');
      if (!res.ok) throw new Error('상조 원장 데이터를 불러오지 못했습니다.');

      const json = await res.json();
      setDataSource(json.source || 'cache');

      if (json.productSpecs) {
        setProductSpecs(json.productSpecs);
      }

      if (json.data && Array.isArray(json.data) && json.data.length > 1) {
        const parsed = parseLedgerRows(json.data);
        setAllMembers(parsed);
      }
    } catch (err: any) {
      console.error('[SangjoMobileView] Load error:', err);
      setErrorMsg(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2차원 배열 파싱
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
    if (pName.includes('하이브리드')) return '상조 서비스와 최신 라이프 케어가 결합된 고품격 종합 플랜';
    if (pName.includes('헬스케어')) return '고객 맞춤형 건강 관리 및 전문 헬스케어 혜택이 연계된 프리미엄 상품';
    if (pName.includes('통신결합')) return '통신비 지원 및 실속형 상조 서비스가 하나로 결합된 혜택 플랜';
    if (pName.includes('라이즈')) return '새로운 시작과 보장을 함께 준비하는 합리적인 상조 멤버십';
    if (pName.includes('550') || pName.includes('480') || pName.includes('470')) return '정성과 예를 다하는 더좋은라이프 정통 프리미엄 의전 서비스';
    if (pName.includes('우림')) return '고품격 전통 장례 의전 및 안심 보장 우림 멤버십 플랜';
    return '더좋은라이프 맞춤형 프리미엄 상조 멤버십';
  };

  const getProductBadgeGradient = (pName: string) => {
    if (!pName) return 'from-slate-700 to-slate-900';
    if (pName.includes('하이브리드')) return 'from-blue-600 to-indigo-700';
    if (pName.includes('헬스케어')) return 'from-emerald-600 to-teal-700';
    if (pName.includes('통신결합')) return 'from-purple-600 to-pink-700';
    if (pName.includes('라이즈')) return 'from-orange-600 to-rose-700';
    if (pName.includes('550') || pName.includes('480') || pName.includes('470')) return 'from-slate-800 to-indigo-950';
    return 'from-blue-700 to-slate-900';
  };

  const handleSearch = (queryOverride?: string) => {
    const q = (queryOverride !== undefined ? queryOverride : searchQuery).trim().replace(/-/g, '');
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

  const handleCopy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };



  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans pb-16">
      
      {/* 1. 모바일 앱 고정 상단 헤더 */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-700 flex items-center justify-center text-white shadow-sm">
            <CreditCard size={16} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black text-slate-900 tracking-tight">더좋은라이프</span>
              <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-700 text-[10px] font-black rounded-md border border-indigo-200">
                의전 전용
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-bold">
              {currentUser?.username || '의전담당자'} ({currentUser?.orgName || '의전팀'})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => loadData(true)}
            disabled={isLoading}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
            title="최신 데이터 새로고침"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin text-blue-600' : ''} />
          </button>
          <button
            onClick={onLogout}
            className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-all"
            title="로그아웃"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* 2. 모바일 메인 컨텐츠 영역 */}
      <main className="flex-1 p-3.5 sm:p-5 max-w-lg mx-auto w-full space-y-4">

        {/* 모바일 검색 바 */}
        <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="relative flex items-center bg-slate-50 rounded-xl border border-slate-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <div className="pl-3 pr-2 text-slate-400">
              <Search size={18} />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="회원명, 주민번호 앞자리, 연락처 검색"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full py-2.5 pr-20 text-sm font-bold text-slate-800 placeholder-slate-400 bg-transparent outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setSelectedMember(null);
                  setHasSearched(false);
                  searchInputRef.current?.focus();
                }}
                className="p-1 mr-1 text-slate-400 hover:text-slate-600"
              >
                <X size={15} />
              </button>
            )}
            <button
              onClick={() => handleSearch()}
              disabled={isLoading}
              className="px-3.5 py-1.5 mr-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black transition-all active:scale-95 disabled:opacity-50"
            >
              조회
            </button>
          </div>

          {/* 간편 안내 태그 */}
          <div className="flex items-center justify-between px-1 text-[10px] text-slate-400 font-bold">
            <span>총 {allMembers.length.toLocaleString()}건 전산 원장 데이터 연결됨</span>
            <span className="text-emerald-600">● 실시간 캐시 작동중</span>
          </div>
        </div>

        {/* 에러 안내 */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => loadData(false)}
              className="px-2 py-0.5 bg-white text-rose-700 font-bold rounded border border-rose-300 text-[11px]"
            >
              재시도
            </button>
          </div>
        )}

        {/* 1. 검색 전 초기 안내 */}
        {!hasSearched && !selectedMember && (
          <div className="text-center py-14 bg-white rounded-3xl border border-slate-200 p-6 space-y-4 shadow-xs">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto text-blue-600 shadow-inner">
              <Search size={28} />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900">
                상조 회원을 검색하세요
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                회원 성명, 주민번호 앞 6자리, 또는 휴대폰 번호를 입력하시면 실시간 불입현황과 장례 지원 혜택을 즉시 확인하실 수 있습니다.
              </p>
            </div>
            <div className="pt-2 flex flex-wrap justify-center gap-1.5">
              {['성명 검색', '주민등록번호', '휴대폰 번호', '회원번호'].map(t => (
                <span key={t} className="px-2.5 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-600 border border-slate-200">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 2. 검색 결과가 없을 때 */}
        {hasSearched && searchResults.length === 0 && (
          <div className="text-center py-12 bg-white rounded-3xl border border-slate-200 p-6 space-y-2 shadow-xs">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto text-slate-400">
              <AlertCircle size={22} />
            </div>
            <p className="text-sm font-black text-slate-800">검색된 회원이 없습니다.</p>
            <p className="text-xs text-slate-400">입력하신 정보가 올바른지 다시 한번 확인해 주세요.</p>
          </div>
        )}

        {/* 3. 복수 검색 결과 카드 목록 */}
        {searchResults.length > 1 && !selectedMember && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-black text-slate-500">
                검색 결과 <strong className="text-blue-600">{searchResults.length}건</strong>
              </span>
              <span className="text-[11px] text-slate-400">조회할 회원을 터치하세요</span>
            </div>

            <div className="space-y-2">
              {searchResults.map((m, idx) => (
                <motion.div
                  key={`${m.memberNo}-${idx}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  onClick={() => setSelectedMember(m)}
                  className="p-4 bg-white rounded-2xl border border-slate-200 hover:border-blue-400 active:bg-blue-50/50 shadow-xs flex items-center justify-between transition-all cursor-pointer"
                >
                  <div className="space-y-1 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-slate-900">{m.name}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        m.status === '정상' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        m.status.includes('해약') || m.status.includes('해지') ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {m.status || '상태미상'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 flex items-center gap-2 font-mono">
                      <span>{m.residentId || '-'}</span>
                      <span className="text-slate-300">|</span>
                      <span className="text-blue-600 font-bold">{m.phone || '-'}</span>
                    </div>

                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded text-white bg-gradient-to-r ${getProductBadgeGradient(m.productName)}`}>
                        {m.productName || '상품'}
                      </span>
                      {m.contractDate && (
                        <span className="text-[10px] text-slate-400">
                          {m.contractDate}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                    <ChevronRight size={16} />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* 4. 선택된 회원 상세 뷰 (모바일 최적화) */}
        {selectedMember && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* 뒤로가기 버튼 */}
            {searchResults.length > 1 && (
              <button
                onClick={() => setSelectedMember(null)}
                className="w-full py-2.5 px-4 bg-white rounded-xl border border-slate-200 text-xs font-black text-blue-600 flex items-center justify-between shadow-2xs cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <ArrowLeft size={14} />
                  <span>검색 목록으로 돌아가기 ({searchResults.length}건)</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">#{selectedMember.memberNo}</span>
              </button>
            )}

            {/* 4-1. 인적 사항 카드 */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2 text-blue-600">
                  <User size={16} />
                  <span className="text-xs font-black uppercase text-slate-800">기본 인적 사항</span>
                </div>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-mono text-[10px] font-bold rounded">
                  회원 #{selectedMember.memberNo}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 block mb-0.5">회원 성명</span>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-2xl font-black text-slate-900">{selectedMember.name}</span>
                  <span className="text-xs font-mono font-bold text-slate-500">{selectedMember.residentId || '-'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">회원 상태</span>
                  <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black ${
                    selectedMember.status === '정상' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                    selectedMember.status.includes('해약') || selectedMember.status.includes('해지') ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                    'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {selectedMember.status || '미기재'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">계약 일자</span>
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1 mt-1">
                    <Calendar size={12} className="text-slate-400" />
                    {selectedMember.contractDate || '-'}
                  </span>
                </div>
              </div>

              {/* 전화걸기 & 복사 바 */}
              {selectedMember.phone && (
                <div className="pt-1 flex gap-2">
                  <a
                    href={`tel:${selectedMember.phone.replace(/[^0-9]/g, '')}`}
                    className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95"
                  >
                    <PhoneCall size={14} />
                    <span>전화 걸기 ({selectedMember.phone})</span>
                  </a>
                  <button
                    onClick={() => handleCopy(selectedMember.phone, 'phone')}
                    className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center"
                    title="번호 복사"
                  >
                    {copiedText === 'phone' ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                  </button>
                </div>
              )}
            </div>

            {/* 4-2. 결제 및 수납 현황 (다크 테마 프리미엄 카드) */}
            <div className="bg-slate-950 rounded-3xl p-5 text-white shadow-xl border border-slate-800 space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-1.5 text-blue-400">
                  <CreditCard size={16} />
                  <span className="text-xs font-black uppercase text-blue-400">결제 및 수납 현황</span>
                </div>
                <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] font-bold rounded border border-slate-700">
                  VAT 포함
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">상품 총액</span>
                  <span className="text-lg font-black text-white">{selectedMember.totalAmount.toLocaleString()}원</span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">월 불입액</span>
                  <span className="text-lg font-black text-white">
                    {selectedMember.monthlyPayment ? `${Number(selectedMember.monthlyPayment.replace(/[^0-9]/g, '') || 0).toLocaleString()}원` : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">계약 / 입금 회차</span>
                  <span className="text-lg font-black text-white">
                    {selectedMember.contractInstallment || '-'} / <strong className="text-blue-400">{selectedMember.depositInstallment || '0'}회</strong>
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">총 입금액</span>
                  <span className="text-lg font-black text-blue-400">{selectedMember.depositAmount.toLocaleString()}원</span>
                </div>
              </div>

              {/* 미납 잔액 강조 박스 */}
              <div className="pt-4 border-t border-slate-800">
                <span className="text-[11px] font-black text-slate-400 uppercase block mb-1">
                  미납 잔액
                </span>
                <div className="text-3xl font-black text-white tracking-tight">
                  {selectedMember.balance.toLocaleString()}원
                </div>
              </div>
            </div>

            {/* 4-3. 가입 상품 정보 카드 */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-1.5 text-blue-600">
                  <Package size={16} />
                  <span className="text-xs font-black uppercase text-slate-800">가입 상품 정보</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-base font-black px-3 py-1 rounded-xl text-white shadow-xs bg-gradient-to-r ${getProductBadgeGradient(selectedMember.productName)}`}>
                  {selectedMember.productName || '미지정 상품'}
                </span>
              </div>

              {selectedMember.productDescription && (
                <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {selectedMember.productDescription}
                </p>
              )}
            </div>

            {/* 4-4. 영업 관리 정보 */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center gap-1.5 text-blue-600 border-b border-slate-100 pb-2.5">
                <Building2 size={16} />
                <span className="text-xs font-black uppercase text-slate-800">영업 관리 정보</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block mb-0.5">소속 본부</span>
                  <span className="font-black text-slate-800">{selectedMember.headquarters || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block mb-0.5">소속 지사</span>
                  <span className="font-black text-slate-800">{selectedMember.branch || '-'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block mb-0.5">담당 사원</span>
                  <span className="font-black text-slate-900">
                    {selectedMember.employee || '-'}
                    {selectedMember.employeeCode ? ` (${selectedMember.employeeCode})` : ''}
                  </span>
                </div>
              </div>
            </div>

          </motion.div>
        )}

      </main>

    </div>
  );
};
