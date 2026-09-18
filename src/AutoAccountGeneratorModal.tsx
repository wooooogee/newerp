import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Zap,
  Sparkles,
  Building2,
  Users,
  Smartphone,
  Monitor,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  ShieldCheck,
  UserPlus,
  UserMinus
} from 'lucide-react';
import { MemberAccount } from './AccountManagementModal';

interface AutoAccountGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (newAccounts: MemberAccount[], deletedUsernames?: string[]) => void;
  existingAccounts: MemberAccount[];
}

interface EmpRowData {
  no: string;
  code: string;
  hq: string;
  branch: string;
  branchOffice: string;
  name: string;
  resNo: string;
  position: string;
  status: string;
  empType: string;
  phone: string;
}

export function AutoAccountGeneratorModal({
  isOpen,
  onClose,
  onGenerate,
  existingAccounts
}: AutoAccountGeneratorModalProps) {
  const [empRows, setEmpRows] = useState<EmpRowData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 1. 다중 선택된 본부 목록 (사원리스트 C열)
  const [selectedHqs, setSelectedHqs] = useState<string[]>([]);
  const [hqSearchTerm, setHqSearchTerm] = useState('');

  // 2. 생성 대상 선택 (본부, 지사, 사원)
  const [targetType, setTargetType] = useState<'all' | 'hq' | 'branch' | 'emp'>('all');

  // 3. 환경 선택 (PC, 모바일, 둘 다)
  const [platformType, setPlatformType] = useState<'pc' | 'mobile' | 'both'>('pc');

  // 4. 이미 생성된 계정 건너뛰기 옵션 (기본값: TRUE)
  const [skipExisting, setSkipExisting] = useState<boolean>(true);

  // 5. 사원리스트에서 사라진 기존 계정 삭제 옵션 (기본값: TRUE)
  const [deleteMissing, setDeleteMissing] = useState<boolean>(true);

  // 사원리스트 데이터 로딩
  useEffect(() => {
    if (!isOpen) return;

    const fetchEmpList = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/sheets/sheetData?sheetName=${encodeURIComponent('사원리스트')}&t=${Date.now()}`);
        if (!res.ok) throw new Error('사원리스트 시트 데이터를 불러오지 못했습니다.');
        const data = await res.json();
        const rows = Array.isArray(data) ? data : (data.rows || []);

        const parsed: EmpRowData[] = rows.slice(1).map((r: any[]) => ({
          no: String(r[0] || '').trim(),
          code: String(r[1] || '').trim(),
          hq: String(r[2] || '').trim(),
          branch: String(r[3] || '').trim(),
          branchOffice: String(r[4] || '').trim(),
          name: String(r[5] || '').trim(),
          resNo: String(r[6] || '').trim(),
          position: String(r[7] || '').trim(),
          status: String(r[8] || '').trim(),
          empType: String(r[9] || '').trim(),
          phone: String(r[11] || '').trim(),
        })).filter(r => r.hq && r.hq !== '-');

        setEmpRows(parsed);

        // 기본값: 전체 본부 자동 선택
        const hqSet = new Set(parsed.map(r => r.hq).filter(Boolean));
        const sortedHqs = Array.from(hqSet).sort();
        setSelectedHqs(sortedHqs);
      } catch (err: any) {
        console.error('[AutoAccountGenerator] 로딩 실패:', err);
        setLoadError(err.message || '데이터 로딩 실패');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmpList();
  }, [isOpen]);

  // 고유 본부 목록 (C열) 및 본부별 통계 (지사수, 사원수)
  const hqStatsList = useMemo(() => {
    const hqMap = new Map<string, { branches: Set<string>; emps: number }>();

    empRows.forEach(r => {
      if (!r.hq) return;
      if (!hqMap.has(r.hq)) {
        hqMap.set(r.hq, { branches: new Set(), emps: 0 });
      }
      const entry = hqMap.get(r.hq)!;
      if (r.branch && r.branch !== '-') {
        entry.branches.add(r.branch);
      }
      let cleanPhone = r.phone.replace(/[^0-9]/g, '');
      if (cleanPhone.length === 10 && cleanPhone.startsWith('10')) {
        cleanPhone = '0' + cleanPhone;
      }
      if (cleanPhone.length >= 10 && cleanPhone.startsWith('01')) {
        entry.emps += 1;
      }
    });

    return Array.from(hqMap.entries())
      .map(([hq, stats]) => ({
        hq,
        branchCount: stats.branches.size,
        empCount: stats.emps
      }))
      .sort((a, b) => a.hq.localeCompare(b.hq));
  }, [empRows]);

  // 본부 검색 필터링된 목록
  const filteredHqStatsList = useMemo(() => {
    if (!hqSearchTerm) return hqStatsList;
    const term = hqSearchTerm.toLowerCase();
    return hqStatsList.filter(item => item.hq.toLowerCase().includes(term));
  }, [hqStatsList, hqSearchTerm]);

  // 본부 전체 선택 / 해제 토글
  const handleSelectAllHqs = () => {
    if (selectedHqs.length === hqStatsList.length) {
      setSelectedHqs([]);
    } else {
      setSelectedHqs(hqStatsList.map(h => h.hq));
    }
  };

  const handleToggleHq = (hqName: string) => {
    setSelectedHqs(prev => 
      prev.includes(hqName) ? prev.filter(h => h !== hqName) : [...prev, hqName]
    );
  };

  // 기존 계정 username 맵 (대소문자 무시)
  const existingUsernameSet = useMemo(() => {
    const set = new Set<string>();
    existingAccounts.forEach(acc => {
      if (acc.username) {
        set.add(acc.username.trim().toUpperCase());
      }
    });
    return set;
  }, [existingAccounts]);

  // 전체 계산 대상 계정 및 신규 생성 대상 계정 분류
  const { allGeneratedAccounts, filteredAccounts, skippedCount } = useMemo(() => {
    if (selectedHqs.length === 0) {
      return { allGeneratedAccounts: [], filteredAccounts: [], skippedCount: 0 };
    }

    const allList: Array<MemberAccount & { note: string; isExisting: boolean; hqSource: string }> = [];
    const platforms = platformType === 'both' ? ['pc', 'mobile'] : [platformType];
    const selectedHqSet = new Set(selectedHqs);

    // 1. 선택된 본부들에 속한 데이터 수집
    const relevantRows = empRows.filter(r => selectedHqSet.has(r.hq));

    // 본부별 고유 지사 맵
    const hqBranchesMap = new Map<string, Set<string>>();
    relevantRows.forEach(r => {
      if (!hqBranchesMap.has(r.hq)) hqBranchesMap.set(r.hq, new Set());
      if (r.branch && r.branch !== '-') {
        hqBranchesMap.get(r.hq)!.add(r.branch);
      }
    });

    // 2. 계정 생성 규칙 적용
    platforms.forEach(p => {
      // 본부 계정 생성
      if (targetType === 'all' || targetType === 'hq') {
        const role = p === 'mobile' ? '본부모바일' : '본부';
        selectedHqs.forEach(hqName => {
          const username = hqName;
          const password = '1234';
          const isExisting = existingUsernameSet.has(username.toUpperCase());

          allList.push({
            role,
            orgName: hqName,
            username,
            password,
            note: `${hqName} 본부 계정 (${p === 'mobile' ? '모바일' : 'PC'})`,
            isExisting,
            hqSource: hqName
          });
        });
      }

      // 지사 계정 생성
      if (targetType === 'all' || targetType === 'branch') {
        const role = p === 'mobile' ? '지사모바일' : '지사';
        selectedHqs.forEach(hqName => {
          const branches = hqBranchesMap.get(hqName);
          if (branches) {
            branches.forEach(branchName => {
              const username = branchName;
              const password = '1234';
              const isExisting = existingUsernameSet.has(username.toUpperCase());

              allList.push({
                role,
                orgName: branchName,
                username,
                password,
                note: `${hqName} > ${branchName} 지사 (${p === 'mobile' ? '모바일' : 'PC'})`,
                isExisting,
                hqSource: hqName
              });
            });
          }
        });
      }
    });

    // 사원 계정 생성 (사원은 PC/모바일 공통 영업사원 권한)
    if (targetType === 'all' || targetType === 'emp') {
      const addedEmpUsernames = new Set<string>();

      relevantRows.forEach(emp => {
        let cleanPhone = emp.phone.replace(/[^0-9]/g, '');
        if (cleanPhone.length === 10 && cleanPhone.startsWith('10')) {
          cleanPhone = '0' + cleanPhone;
        }
        if (!cleanPhone || cleanPhone.length < 10 || !cleanPhone.startsWith('01')) return;

        const username = `a${cleanPhone}`;
        const password = cleanPhone;

        // 동일 번호 사원 중복 방지
        if (addedEmpUsernames.has(username)) return;
        addedEmpUsernames.add(username);

        const isExisting = existingUsernameSet.has(username.toUpperCase());
        // 소속 조직명: 사원코드(B열) 우선 사용, 없으면 본부명
        const orgName = emp.code || emp.hq;

        allList.push({
          role: '영업사원',
          orgName,
          username,
          password,
          note: `${emp.name} [${emp.code || '사원코드없음'}] (${emp.branch || emp.hq})`,
          isExisting,
          hqSource: emp.hq
        });
      });
    }

    // 이미 생성된 계정 건너뛰기 필터링
    let skipped = 0;
    const filtered = allList.filter(acc => {
      if (acc.isExisting) {
        skipped += 1;
        return !skipExisting; // 건너뛰기 옵션 켜져있으면 제외
      }
      return true;
    });

    return {
      allGeneratedAccounts: allList,
      filteredAccounts: filtered,
      skippedCount: skipped
    };
  }, [selectedHqs, empRows, targetType, platformType, existingUsernameSet, skipExisting]);

  // 선택된 본부 범위 내에서 사원리스트에 없는 기존 계정(퇴사 또는 시트에서 삭제된 계정) 감지
  const missingAccountsToDelete = useMemo(() => {
    if (selectedHqs.length === 0 || existingAccounts.length === 0 || empRows.length === 0) {
      return [];
    }

    const selectedHqSet = new Set(selectedHqs);
    const relevantEmpRows = empRows.filter(r => selectedHqSet.has(r.hq));

    const validPhoneSet = new Set<string>();
    const validCodeSet = new Set<string>();
    const validBranchSet = new Set<string>();
    const validHqSet = new Set<string>();
    const retiredPhoneSet = new Set<string>();
    const retiredCodeSet = new Set<string>();

    relevantEmpRows.forEach(emp => {
      if (emp.hq && emp.hq !== '-') validHqSet.add(emp.hq.trim());
      if (emp.branch && emp.branch !== '-') validBranchSet.add(emp.branch.trim());
      if (emp.code) validCodeSet.add(emp.code.trim().toUpperCase());

      let cleanPhone = emp.phone.replace(/[^0-9]/g, '');
      if (cleanPhone.length === 10 && cleanPhone.startsWith('10')) cleanPhone = '0' + cleanPhone;
      if (cleanPhone.length >= 10 && cleanPhone.startsWith('01')) {
        validPhoneSet.add(cleanPhone);
        const statusClean = (emp.status || '').trim();
        if (statusClean.includes('퇴사') || statusClean.includes('해촉') || statusClean.includes('중지')) {
          retiredPhoneSet.add(cleanPhone);
          if (emp.code) retiredCodeSet.add(emp.code.trim().toUpperCase());
        }
      }
    });

    // existingAccounts를 username별로 그룹핑
    const map = new Map<string, { username: string; primaryRole: string; orgEntries: { role: string; orgName: string }[] }>();
    existingAccounts.forEach(m => {
      const uname = (m.username || '').trim();
      if (!uname) return;
      const lower = uname.toLowerCase();
      if (!map.has(lower)) {
        map.set(lower, { username: uname, primaryRole: m.role || '지사', orgEntries: [{ role: m.role, orgName: m.orgName }] });
      } else {
        map.get(lower)!.orgEntries.push({ role: m.role, orgName: m.orgName });
      }
    });

    const toDelete: Array<{ username: string; role: string; orgName: string; reason: string }> = [];

    map.forEach(acc => {
      // 최고 관리자, 총무 보호
      if (acc.primaryRole === '관리자' || acc.primaryRole === '총무') return;

      // 1. 영업사원 계정
      const isSalesPattern = /^a01[0-9]{8,9}$/i.test(acc.username) || acc.primaryRole === '영업사원';
      if (isSalesPattern) {
        // 선택된 본부 소속인지 검사
        const belongsToSelected = acc.orgEntries.some(o => 
          selectedHqSet.has(o.orgName.trim()) || 
          validBranchSet.has(o.orgName.trim()) || 
          validCodeSet.has(o.orgName.trim().toUpperCase())
        );

        if (belongsToSelected) {
          let cleanPhone = acc.username.replace(/^[aA]/, '').replace(/[^0-9]/g, '');
          if (cleanPhone.length === 10 && cleanPhone.startsWith('10')) cleanPhone = '0' + cleanPhone;

          const exists = validPhoneSet.has(cleanPhone) || validCodeSet.has(acc.username.toUpperCase());
          if (!exists) {
            toDelete.push({
              username: acc.username,
              role: acc.primaryRole,
              orgName: acc.orgEntries.map(o => o.orgName).join(', '),
              reason: '사원리스트에서 사원정보 삭제됨'
            });
          } else if (retiredPhoneSet.has(cleanPhone) || retiredCodeSet.has(acc.username.toUpperCase())) {
            toDelete.push({
              username: acc.username,
              role: acc.primaryRole,
              orgName: acc.orgEntries.map(o => o.orgName).join(', '),
              reason: '사원리스트에서 퇴사/해촉 처리됨'
            });
          }
        }
        return;
      }

      // 2. 본부 계정
      if (acc.primaryRole === '본부' || acc.primaryRole === '본부모바일') {
        if (selectedHqSet.has(acc.username) && !validHqSet.has(acc.username)) {
          toDelete.push({
            username: acc.username,
            role: acc.primaryRole,
            orgName: acc.orgEntries.map(o => o.orgName).join(', '),
            reason: '사원리스트에 존재하지 않는 본부'
          });
        }
        return;
      }

      // 3. 지사 계정
      if (acc.primaryRole === '지사' || acc.primaryRole === '지사모바일') {
        const belongsToSelected = acc.orgEntries.some(o => selectedHqSet.has(o.orgName.trim()));
        if (belongsToSelected && !validBranchSet.has(acc.username)) {
          toDelete.push({
            username: acc.username,
            role: acc.primaryRole,
            orgName: acc.orgEntries.map(o => o.orgName).join(', '),
            reason: '사원리스트에 존재하지 않는 지사'
          });
        }
      }
    });

    return toDelete;
  }, [selectedHqs, existingAccounts, empRows]);

  // 최종 일괄 생성 및 사라진 계정 삭제 처리 핸들러
  const handleConfirmGenerate = () => {
    const deletedUsernames = deleteMissing ? missingAccountsToDelete.map(a => a.username) : [];

    if (filteredAccounts.length === 0 && deletedUsernames.length === 0) {
      alert('생성할 신규 계정이나 정리할 삭제 대상 계정이 없습니다.');
      return;
    }

    const accountsToInsert: MemberAccount[] = filteredAccounts.map(p => ({
      role: p.role,
      orgName: p.orgName,
      username: p.username,
      password: p.password
    }));

    onGenerate(accountsToInsert, deletedUsernames);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
      {/* 딤 배경 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
      />

      {/* 모달 본체 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        className="relative bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 w-[98vw] max-w-[1580px] h-[96vh] max-h-[96vh] flex flex-col overflow-hidden z-10"
      >
        {/* 모달 상단 헤더 */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 shadow-2xs">
              <Zap size={22} className="text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 tracking-tight">조직 계정 원클릭 대량 자동 생성기</h2>
                <span className="text-xs px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-bold">
                  다중 본부 일괄 지원
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                사원리스트 시트의 본부/지사/사원 정보를 조회하여 표준 아이디와 비밀번호로 신규 계정만 일괄 생성합니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* 모달 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-500">
              <RefreshCw size={28} className="animate-spin text-indigo-600" />
              <span className="text-sm font-bold">구글 시트 [사원리스트] 데이터를 실시간 조회 중입니다...</span>
            </div>
          ) : loadError ? (
            <div className="p-5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 text-xs font-bold">
              <AlertCircle size={20} className="shrink-0" />
              <span>{loadError}</span>
            </div>
          ) : (
            <>
              {/* 1. 다중 본부 선택 영역 */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Building2 size={16} className="text-blue-600" />
                    <span className="text-xs font-black text-slate-800">
                      1. 대상 본부 선택 (다중 선택 가능)
                    </span>
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                      {selectedHqs.length} / {hqStatsList.length}개 선택됨
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* 본부 검색창 */}
                    <div className="relative w-40 sm:w-48">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="본부명 검색..."
                        value={hqSearchTerm}
                        onChange={(e) => setHqSearchTerm(e.target.value)}
                        className="w-full pl-7 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:bg-white outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleSelectAllHqs}
                      className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer whitespace-nowrap"
                    >
                      {selectedHqs.length === hqStatsList.length ? '전체 해제' : '전체 선택'}
                    </button>
                  </div>
                </div>

                {/* 본부 칩/태그 다중 선택 그리드 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-[220px] overflow-y-auto custom-scrollbar p-1">
                  {filteredHqStatsList.map(({ hq, branchCount, empCount }) => {
                    const isChecked = selectedHqs.includes(hq);
                    return (
                      <button
                        key={hq}
                        type="button"
                        onClick={() => handleToggleHq(hq)}
                        className={`px-2.5 py-2 rounded-xl text-left text-xs font-bold transition-all border flex items-center justify-between cursor-pointer ${
                          isChecked
                            ? 'bg-blue-50 border-blue-300 text-blue-900 shadow-2xs'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {isChecked ? (
                            <CheckSquare size={14} className="text-blue-600 shrink-0" />
                          ) : (
                            <Square size={14} className="text-slate-400 shrink-0" />
                          )}
                          <span className="truncate">{hq}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-normal shrink-0 ml-1">
                          사원{empCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. 생성 옵션 설정 카드 */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
                  {/* 2-1. 생성 대상 선택 */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Users size={14} className="text-indigo-500" />
                      2. 생성 대상 <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTargetType('all')}
                        className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          targetType === 'all'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        본부+지사+사원
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetType('emp')}
                        className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          targetType === 'emp'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        사원만 (대량 생성)
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetType('hq')}
                        className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          targetType === 'hq'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        본부 계정만
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetType('branch')}
                        className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          targetType === 'branch'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        지사 계정만
                      </button>
                    </div>
                  </div>

                  {/* 2-2. 환경 선택 (PC / 모바일) */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Monitor size={14} className="text-emerald-500" />
                      3. 실행 환경 (본부/지사) <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPlatformType('pc')}
                        className={`px-2 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                          platformType === 'pc'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Monitor size={12} />
                        PC 전용
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlatformType('mobile')}
                        className={`px-2 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                          platformType === 'mobile'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <Smartphone size={12} />
                        모바일
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlatformType('both')}
                        className={`px-2 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          platformType === 'both'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        둘 다 각각
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                      * 사원 계정은 PC/모바일 공통 영업사원 권한으로 자동 생성됩니다.
                    </p>
                  </div>

                  {/* 2-3. 중복 계정 처리 기본 조건 */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-amber-500" />
                      4. 중복 계정 처리 조건
                    </label>
                    <div 
                      onClick={() => setSkipExisting(!skipExisting)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                        skipExisting 
                          ? 'bg-amber-50/70 border-amber-300 text-amber-900' 
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={skipExisting}
                        onChange={() => {}}
                        className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                      <div className="text-xs">
                        <span className="font-black block">기존 계정 자동 보호 (건너뛰기)</span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          (이미 등록된 아이디는 유지하고 <b>신규만 추가</b>)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2-4. 사라진 계정 자동 정리 조건 */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <UserMinus size={14} className="text-rose-500" />
                      5. 사라진 계정 동시 정리
                    </label>
                    <div 
                      onClick={() => setDeleteMissing(!deleteMissing)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                        deleteMissing 
                          ? 'bg-rose-50/70 border-rose-300 text-rose-900' 
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={deleteMissing}
                        onChange={() => {}}
                        className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                      <div className="text-xs">
                        <span className="font-black flex items-center gap-1.5">
                          <span>시트 미존재/퇴사 계정 삭제</span>
                          {missingAccountsToDelete.length > 0 && (
                            <span className="px-1.5 py-0.2 bg-rose-600 text-white rounded text-[10px] font-black leading-none">
                              {missingAccountsToDelete.length}개
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          (선택한 본부에서 퇴사/삭제된 기존 계정 함께 제거)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 생성 규칙 요약 안내 */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2 text-slate-600">
                  <div className="flex items-center gap-4 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <b>본부/지사:</b> 아이디 = <b>본부명/지사명</b>, 비밀번호 = <b>1234</b>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <b>영업사원:</b> 아이디 = <b>a010...</b>, 비밀번호 = <b>010...</b>, 관리권한 = <b>사원코드</b>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. 생성 예정 미리보기 테이블 */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-5 py-3 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs font-black text-slate-800">생성 예정 계정 목록</h3>
                    <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 font-black rounded-full text-xs">
                      신규 추가 {filteredAccounts.length}개
                    </span>
                    {deleteMissing && missingAccountsToDelete.length > 0 && (
                      <span className="px-2.5 py-0.5 bg-rose-100 text-rose-700 font-black rounded-full text-xs">
                        사라진 계정 {missingAccountsToDelete.length}개 동시 삭제 예정
                      </span>
                    )}
                    {skippedCount > 0 && skipExisting && (
                      <span className="text-[11px] text-slate-400 font-medium">
                        (이미 등록된 계정 {skippedCount}개 제외됨)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-medium">
                    선택된 {selectedHqs.length}개 본부 대상
                  </div>
                </div>

                <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 font-black sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2 text-center w-12 whitespace-nowrap">No</th>
                        <th className="px-4 py-2 w-24 whitespace-nowrap">권한 (구분)</th>
                        <th className="px-4 py-2 min-w-[150px] whitespace-nowrap">로그인 아이디</th>
                        <th className="px-4 py-2 min-w-[140px] whitespace-nowrap">비밀번호</th>
                        <th className="px-4 py-2 min-w-[140px] whitespace-nowrap">소속 (사원코드)</th>
                        <th className="px-4 py-2 min-w-[180px]">사원명 / 참고</th>
                        <th className="px-4 py-2 text-center w-20 whitespace-nowrap">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredAccounts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-slate-400 font-bold">
                            {selectedHqs.length === 0
                              ? '위에서 대상 본부를 1개 이상 선택해 주세요.'
                              : '추가할 신규 계정이 없습니다. (선택된 본부의 모든 계정이 이미 등록되어 있습니다)'}
                          </td>
                        </tr>
                      ) : (
                        filteredAccounts.map((acc, idx) => (
                          <tr key={`${acc.role}-${acc.username}-${idx}`} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-center text-slate-400 font-mono text-[11px] whitespace-nowrap">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black ${
                                acc.role.includes('본부') ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                acc.role.includes('지사') ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                                'bg-amber-100 text-amber-700 border border-amber-200'
                              }`}>
                                {acc.role}
                              </span>
                            </td>
                            <td className="px-4 py-2 font-mono font-black text-blue-600 whitespace-nowrap">
                              {acc.username}
                            </td>
                            <td className="px-4 py-2 font-mono text-slate-700 font-bold whitespace-nowrap">
                              {acc.password}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-bold border border-slate-200">
                                {acc.orgName}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-slate-600 font-medium truncate max-w-xs">
                              {acc.note || '-'}
                            </td>
                            <td className="px-4 py-2 text-center whitespace-nowrap">
                              {acc.isExisting ? (
                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-bold">
                                  기존 갱신
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold">
                                  신규 등록
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 모달 하단 푸터 액션 */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            생성된 계정은 목록에 즉시 추가되며, 상단 <b>[시트에 최종 저장]</b>을 누르면 구글 시트에 영구 저장됩니다.
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              취소
            </button>
            <button
              onClick={handleConfirmGenerate}
              disabled={isLoading || (filteredAccounts.length === 0 && (!deleteMissing || missingAccountsToDelete.length === 0))}
              className={`px-5 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-all cursor-pointer ${
                filteredAccounts.length > 0 || (deleteMissing && missingAccountsToDelete.length > 0)
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 scale-102 ring-2 ring-indigo-300'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <UserPlus size={15} />
              <span>
                {filteredAccounts.length > 0 && `${filteredAccounts.length}개 신규 생성`}
                {filteredAccounts.length > 0 && deleteMissing && missingAccountsToDelete.length > 0 && ' 및 '}
                {deleteMissing && missingAccountsToDelete.length > 0 && `${missingAccountsToDelete.length}개 사라진 계정 정리`}
                {filteredAccounts.length === 0 && (!deleteMissing || missingAccountsToDelete.length === 0) && '처리할 대상 없음'}
                {' 실행'}
              </span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
