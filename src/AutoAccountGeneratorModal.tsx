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
  Phone,
  KeyRound,
  UserCheck
} from 'lucide-react';
import { MemberAccount } from './AccountManagementModal';

interface AutoAccountGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (newAccounts: MemberAccount[]) => void;
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

  // 1. 선택된 본부 (사원리스트 C열)
  const [selectedHq, setSelectedHq] = useState<string>('');

  // 2. 생성 대상 선택 (본부, 지사, 사원)
  const [targetType, setTargetType] = useState<'all' | 'hq' | 'branch' | 'emp'>('all');

  // 3. 환경 선택 (PC, 모바일)
  const [platformType, setPlatformType] = useState<'pc' | 'mobile' | 'both'>('pc');

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

        // 헤더 제외 (첫 행은 컬럼명)
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

        // 기본 본부 자동 선택
        const hqSet = new Set(parsed.map(r => r.hq).filter(Boolean));
        const sortedHqs = Array.from(hqSet).sort();
        if (sortedHqs.length > 0 && !selectedHq) {
          setSelectedHq(sortedHqs[0]);
        }
      } catch (err: any) {
        console.error('[AutoAccountGenerator] 로딩 실패:', err);
        setLoadError(err.message || '데이터 로딩 실패');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmpList();
  }, [isOpen]);

  // 고유 본부 목록 (C열)
  const availableHqs = useMemo(() => {
    const set = new Set(empRows.map(r => r.hq).filter(Boolean));
    return Array.from(set).sort();
  }, [empRows]);

  // 선택된 본부 산하 지사 목록 (D열)
  const hqBranches = useMemo(() => {
    if (!selectedHq) return [];
    const set = new Set<string>();
    empRows.filter(r => r.hq === selectedHq).forEach(r => {
      if (r.branch && r.branch !== '-' && r.branch !== selectedHq) {
        set.add(r.branch);
      } else if (r.branch && r.branch !== '-') {
        set.add(r.branch);
      }
    });
    return Array.from(set).sort();
  }, [empRows, selectedHq]);

  // 선택된 본부 산하 유효 사원 목록 (휴대폰번호 유효한 사원들)
  const hqEmps = useMemo(() => {
    if (!selectedHq) return [];
    return empRows.filter(r => {
      if (r.hq !== selectedHq) return false;
      const cleanPhone = r.phone.replace(/[^0-9]/g, '');
      return cleanPhone.length >= 10 && cleanPhone.startsWith('01');
    });
  }, [empRows, selectedHq]);

  // 기존 계정 username 맵
  const existingUsernameMap = useMemo(() => {
    const map = new Map<string, MemberAccount>();
    existingAccounts.forEach(acc => {
      map.set(acc.username.trim().toUpperCase(), acc);
    });
    return map;
  }, [existingAccounts]);

  // 생성될 계정 미리보기 목록 계산
  const previewAccounts = useMemo(() => {
    if (!selectedHq) return [];
    const results: Array<MemberAccount & { note?: string; isExisting?: boolean }> = [];

    const platforms = platformType === 'both' ? ['pc', 'mobile'] : [platformType];

    platforms.forEach(p => {
      // 1. 본부 계정 생성
      if (targetType === 'all' || targetType === 'hq') {
        const role = p === 'mobile' ? '본부모바일' : '본부';
        const username = selectedHq;
        const password = '1234';
        const isExisting = existingUsernameMap.has(username.toUpperCase());

        results.push({
          role,
          orgName: selectedHq,
          username,
          password,
          note: `본부 계정 (${p === 'mobile' ? '모바일' : 'PC'})`,
          isExisting
        });
      }

      // 2. 지사 계정 생성
      if (targetType === 'all' || targetType === 'branch') {
        const role = p === 'mobile' ? '지사모바일' : '지사';
        hqBranches.forEach(branchName => {
          const username = branchName;
          const password = '1234';
          const isExisting = existingUsernameMap.has(username.toUpperCase());

          results.push({
            role,
            orgName: branchName,
            username,
            password,
            note: `${selectedHq} > ${branchName} 지사 (${p === 'mobile' ? '모바일' : 'PC'})`,
            isExisting
          });
        });
      }
    });

    // 3. 사원 계정 생성 (사원은 PC/모바일 공통 영업사원 권한)
    if (targetType === 'all' || targetType === 'emp') {
      const addedEmpUsernames = new Set<string>();

      hqEmps.forEach(emp => {
        const cleanPhone = emp.phone.replace(/[^0-9]/g, '');
        if (!cleanPhone) return;

        const username = `a${cleanPhone}`;
        const password = cleanPhone;

        // 동일 번호 중복 생성 방지
        if (addedEmpUsernames.has(username)) return;
        addedEmpUsernames.add(username);

        const isExisting = existingUsernameMap.has(username.toUpperCase());
        // 소속 조직명(orgName): 사원코드(B열) 우선 사용, 없으면 본부명
        const orgName = emp.code || selectedHq;

        results.push({
          role: '영업사원',
          orgName,
          username,
          password,
          note: `${emp.name} [${emp.code || '사원코드없음'}] (${emp.branch || selectedHq})`,
          isExisting
        });
      });
    }

    return results;
  }, [selectedHq, targetType, platformType, hqBranches, hqEmps, existingUsernameMap]);

  // 최종 생성 버튼 핸들러
  const handleConfirmGenerate = () => {
    if (previewAccounts.length === 0) {
      alert('생성할 계정이 없습니다.');
      return;
    }

    const accountsToInsert: MemberAccount[] = previewAccounts.map(p => ({
      role: p.role,
      orgName: p.orgName,
      username: p.username,
      password: p.password
    }));

    onGenerate(accountsToInsert);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
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
        className="relative bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden z-10"
      >
        {/* 모달 상단 헤더 */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 shadow-2xs">
              <Zap size={22} className="text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 tracking-tight">조직 계정 원클릭 자동 생성기</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full border border-indigo-200">
                  사원리스트 시트 기반
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                사원리스트 시트의 본부/지사/사원 정보를 분석하여 표준 아이디와 비밀번호로 일괄 생성합니다.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* 바디 컨텐츠 (스크롤) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw size={28} className="animate-spin text-indigo-500" />
              <p className="text-sm font-bold">사원리스트 시트 데이터를 불러오는 중입니다...</p>
            </div>
          ) : loadError ? (
            <div className="p-5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 text-xs font-bold">
              <AlertCircle size={20} className="shrink-0" />
              <span>{loadError}</span>
            </div>
          ) : (
            <>
              {/* 설정 영역 카드 */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 1. 소속 본부 선택 */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Building2 size={14} className="text-blue-500" />
                      1. 소속 본부 선택 <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={selectedHq}
                      onChange={(e) => setSelectedHq(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                    >
                      {availableHqs.map(hq => (
                        <option key={hq} value={hq}>{hq}</option>
                      ))}
                    </select>
                    {selectedHq && (
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                        <span>지사 {hqBranches.length}개</span>
                        <span>•</span>
                        <span>사원 {hqEmps.length}명</span>
                      </div>
                    )}
                  </div>

                  {/* 2. 생성 대상 선택 */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Users size={14} className="text-indigo-500" />
                      2. 계정 생성 대상 <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTargetType('all')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          targetType === 'emp'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        사원만 ({hqEmps.length}명)
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetType('hq')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          targetType === 'hq'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        본부만 (1개)
                      </button>
                      <button
                        type="button"
                        onClick={() => setTargetType('branch')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          targetType === 'branch'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        지사만 ({hqBranches.length}개)
                      </button>
                    </div>
                  </div>

                  {/* 3. 환경 선택 (PC / 모바일) */}
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Monitor size={14} className="text-emerald-500" />
                      3. 실행 환경 (본부/지사) <span className="text-rose-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPlatformType('pc')}
                        className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
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
                        className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
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
                        className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          platformType === 'both'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        둘 다 각각
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 font-medium">
                      * 사원 계정은 PC/모바일 공통으로 영업사원 권한으로 자동 생성됩니다.
                    </p>
                  </div>
                </div>

                {/* 생성 규칙 요약 안내 카드 */}
                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-1.5 text-slate-600">
                  <div className="font-black text-slate-700 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-amber-500" />
                    계정 생성 표준 규칙 적용 현황:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                      <span className="font-bold text-blue-600">본부 / 지사:</span>
                      <span>아이디 = <b>본부명/지사명</b>, 비밀번호 = <b>1234</b></span>
                    </div>
                    <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                      <span className="font-bold text-amber-600">영업 사원:</span>
                      <span>아이디 = <b>a010...</b>, 비밀번호 = <b>010...</b></span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 미리보기 영역 */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-5 py-3 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-black text-slate-800">생성 예정 계정 미리보기</h3>
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 font-bold rounded-full text-[11px]">
                      총 {previewAccounts.length}개 계정
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    (신규: {previewAccounts.filter(p => !p.isExisting).length}개 / 기존 갱신: {previewAccounts.filter(p => p.isExisting).length}개)
                  </div>
                </div>

                <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 font-black sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 text-center w-12 whitespace-nowrap">No</th>
                        <th className="px-4 py-2.5 w-24 whitespace-nowrap">권한 (구분)</th>
                        <th className="px-4 py-2.5 min-w-[140px] whitespace-nowrap">로그인 아이디</th>
                        <th className="px-4 py-2.5 w-28 whitespace-nowrap">비밀번호</th>
                        <th className="px-4 py-2.5 min-w-[140px] whitespace-nowrap">소속 (사원코드)</th>
                        <th className="px-4 py-2.5 min-w-[180px]">비고 / 사원명</th>
                        <th className="px-4 py-2.5 text-center w-20 whitespace-nowrap">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {previewAccounts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-slate-400 font-bold">
                            선택된 조건에 해당하는 계정 대상이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        previewAccounts.map((acc, idx) => (
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
                              <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-bold border border-slate-200">
                                {acc.orgName}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-slate-600 font-medium">
                              {acc.note || '-'}
                            </td>
                            <td className="px-4 py-2 text-center whitespace-nowrap">
                              {acc.isExisting ? (
                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-bold">
                                  갱신
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold">
                                  신규
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
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            생성된 계정은 목록에 추가되며, 상단 <b>[시트에 최종 저장]</b>을 누르면 시트에 영구 저장됩니다.
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              취소
            </button>
            <button
              onClick={handleConfirmGenerate}
              disabled={isLoading || previewAccounts.length === 0}
              className={`px-5 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-all cursor-pointer ${
                previewAccounts.length > 0
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Sparkles size={14} />
              <span>{previewAccounts.length}개 계정 일괄 생성 추가</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
