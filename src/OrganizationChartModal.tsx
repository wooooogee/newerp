import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, Search, Download, Image as ImageIcon, Building2, Users, ChevronDown, ChevronRight, 
  KeyRound, Copy, Check, Eye, EyeOff, Sparkles, FolderTree, Phone, ShieldCheck, RefreshCw, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as htmlToImage from 'html-to-image';

// window.XLSX 사용
const XLSX = (window as any).XLSX;

export interface EmpInfo {
  no: string;
  code: string;       // B열: 사원코드
  hq: string;         // C열: 본부명
  branch: string;     // D열: 지사명
  branchOffice: string;// E열: 지점명
  name: string;       // F열: 사원명
  position: string;   // H열: 직책
  status: string;     // I열: 상태
  phone: string;      // L열: 휴대폰번호
}

export interface AccountInfo {
  role: string;
  orgName: string;
  username: string;
  password: string;
}

interface DivisionInfo {
  id: string;
  name: string;
  hqNames: string[];
}

interface OrganizationChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  divisionSettings: DivisionInfo[];
  members: AccountInfo[];
  availableHqs?: string[];
}

export const OrganizationChartModal: React.FC<OrganizationChartModalProps> = ({
  isOpen,
  onClose,
  divisionSettings,
  members,
  availableHqs = [],
}) => {
  const chartRef = useRef<HTMLDivElement>(null);

  // 사원리스트 데이터
  const [empList, setEmpList] = useState<EmpInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 필터 및 검색 상태
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDivFilter, setSelectedDivFilter] = useState<string>('ALL');
  const [selectedHqFilter, setSelectedHqFilter] = useState<string>('ALL');

  // 아코디언(접기/펼치기) 상태
  const [collapsedHqs, setCollapsedHqs] = useState<Set<string>>(new Set());
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(new Set());

  // 이미지 내보내기 진행 상태
  const [isExportingImage, setIsExportingImage] = useState(false);

  // 계정 확인 팝업 상태
  const [inspectTarget, setInspectTarget] = useState<{
    type: 'div' | 'hq' | 'branch' | 'emp';
    name: string;
    subTitle?: string;
    matchedAccounts: AccountInfo[];
  } | null>(null);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

  // 1. 사원리스트 시트 데이터 불러오기
  const fetchEmpList = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/sheets/sheetData?sheetName=${encodeURIComponent('사원리스트')}&t=${Date.now()}`);
      if (!res.ok) throw new Error('사원리스트 시트 데이터를 불러오지 못했습니다.');
      const data = await res.json();
      const rows = Array.isArray(data) ? data : (data.rows || []);

      const parsed: EmpInfo[] = rows.slice(1).map((r: any[]) => {
        let cleanPhone = String(r[11] || '').trim();
        const digits = cleanPhone.replace(/[^0-9]/g, '');
        if (digits.length === 10 && digits.startsWith('10')) {
          cleanPhone = '0' + digits;
        } else if (digits.length >= 10 && digits.startsWith('01')) {
          cleanPhone = digits;
        }

        return {
          no: String(r[0] || '').trim(),
          code: String(r[1] || '').trim(),
          hq: String(r[2] || '').trim(),
          branch: String(r[3] || '').trim(),
          branchOffice: String(r[4] || '').trim(),
          name: String(r[5] || '').trim(),
          position: String(r[7] || '').trim(),
          status: String(r[8] || '').trim(),
          phone: cleanPhone,
        };
      }).filter(r => r.hq && r.hq !== '-');

      setEmpList(parsed);
    } catch (err: any) {
      console.error('[OrganizationChartModal] 사원리스트 로딩 실패:', err);
      setLoadError(err.message || '데이터 로딩 실패');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchEmpList();
    }
  }, [isOpen]);

  // 전화번호 포맷팅 헬퍼
  const formatPhone = (phoneStr: string) => {
    const digits = phoneStr.replace(/[^0-9]/g, '');
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phoneStr;
  };

  // 2. 계정 매칭 헬퍼 함수
  const findAccountsForTarget = (type: 'hq' | 'branch' | 'emp', targetName: string, extra?: { code?: string; phone?: string; hq?: string; branch?: string }) => {
    if (!members || members.length === 0) return [];

    const normTarget = targetName.toLowerCase().replace(/[\s()]/g, '');

    if (type === 'hq') {
      return members.filter(m => {
        const mOrg = (m.orgName || '').toLowerCase().replace(/[\s()본부]/g, '');
        const mUser = (m.username || '').toLowerCase().replace(/[\s()본부]/g, '');
        return mOrg === normTarget || mUser === normTarget || (m.role?.includes('본부') && mOrg.includes(normTarget));
      });
    }

    if (type === 'branch') {
      return members.filter(m => {
        const mOrg = (m.orgName || '').toLowerCase().replace(/[\s()지사지점]/g, '');
        const mUser = (m.username || '').toLowerCase().replace(/[\s()지사지점]/g, '');
        return mOrg === normTarget || mUser === normTarget || (m.role?.includes('지사') && mOrg.includes(normTarget));
      });
    }

    // type === 'emp'
    const empCode = (extra?.code || '').toLowerCase().trim();
    const cleanPhone = (extra?.phone || '').replace(/[^0-9]/g, '');
    const phoneNoZero = cleanPhone.startsWith('0') ? cleanPhone.slice(1) : cleanPhone;

    return members.filter(m => {
      const mUser = (m.username || '').toLowerCase().trim();
      const mOrg = (m.orgName || '').toLowerCase().trim();

      // 1) 사원코드 일치
      if (empCode && (mUser === empCode || mUser === 'a' + empCode)) return true;
      // 2) 휴대폰번호 일치
      if (cleanPhone && (mUser === cleanPhone || mUser === 'a' + cleanPhone || mUser === 'a010' + cleanPhone.slice(3) || mUser === phoneNoZero || mUser === 'a' + phoneNoZero)) return true;
      // 3) 사원명 일치
      if (mOrg === normTarget || mUser === normTarget) return true;
      return false;
    });
  };

  // 3. 계층 조직도 데이터 트리 빌드
  const orgTree = useMemo(() => {
    // 1) 사원리스트에 등장하는 모든 본부 및 등록된 availableHqs 합집합
    const allHqs = Array.from(new Set([
      ...empList.map(e => e.hq).filter(Boolean),
      ...availableHqs.filter(Boolean)
    ])).sort((a, b) => a.localeCompare(b, 'ko'));

    // 본부별 소속 지사 및 사원 매핑
    const hqMap = new Map<string, {
      branches: Map<string, EmpInfo[]>;
      allEmps: EmpInfo[];
    }>();

    allHqs.forEach(hq => {
      hqMap.set(hq, {
        branches: new Map(),
        allEmps: []
      });
    });

    empList.forEach(emp => {
      if (!emp.hq) return;
      if (!hqMap.has(emp.hq)) {
        hqMap.set(emp.hq, { branches: new Map(), allEmps: [] });
      }
      const hqEntry = hqMap.get(emp.hq)!;
      hqEntry.allEmps.push(emp);

      const branchKey = emp.branch && emp.branch !== '-' ? emp.branch : '본부 직속';
      if (!hqEntry.branches.has(branchKey)) {
        hqEntry.branches.set(branchKey, []);
      }
      hqEntry.branches.get(branchKey)!.push(emp);
    });

    // 2) 사업단별 그룹핑
    const divisionsList: {
      id: string;
      name: string;
      hqs: {
        hqName: string;
        branches: { branchName: string; emps: EmpInfo[] }[];
        empCount: number;
      }[];
      totalEmps: number;
    }[] = [];

    const assignedHqSet = new Set<string>();

    (divisionSettings || []).forEach(div => {
      const divHqNames = (div.hqNames || []).filter(h => hqMap.has(h));
      divHqNames.forEach(h => assignedHqSet.add(h));

      const hqItems = divHqNames.map(hqName => {
        const hqData = hqMap.get(hqName)!;
        const branchItems = Array.from(hqData.branches.entries()).map(([branchName, emps]) => ({
          branchName,
          emps
        })).sort((a, b) => {
          if (a.branchName === '본부 직속') return -1;
          if (b.branchName === '본부 직속') return 1;
          return a.branchName.localeCompare(b.branchName, 'ko');
        });

        return {
          hqName,
          branches: branchItems,
          empCount: hqData.allEmps.length
        };
      }).sort((a, b) => a.hqName.localeCompare(b.hqName, 'ko'));

      const divTotalEmps = hqItems.reduce((acc, h) => acc + h.empCount, 0);

      divisionsList.push({
        id: div.id,
        name: div.name,
        hqs: hqItems,
        totalEmps: divTotalEmps
      });
    });

    // 3) 사업단 미소속 본부 (독립 본부)
    const independentHqNames = allHqs.filter(h => !assignedHqSet.has(h));
    if (independentHqNames.length > 0) {
      const hqItems = independentHqNames.map(hqName => {
        const hqData = hqMap.get(hqName) || { branches: new Map(), allEmps: [] };
        const branchItems = Array.from(hqData.branches.entries()).map(([branchName, emps]) => ({
          branchName,
          emps
        })).sort((a, b) => {
          if (a.branchName === '본부 직속') return -1;
          if (b.branchName === '본부 직속') return 1;
          return a.branchName.localeCompare(b.branchName, 'ko');
        });

        return {
          hqName,
          branches: branchItems,
          empCount: hqData.allEmps.length
        };
      }).sort((a, b) => a.hqName.localeCompare(b.hqName, 'ko'));

      const indepTotalEmps = hqItems.reduce((acc, h) => acc + h.empCount, 0);

      divisionsList.push({
        id: 'INDEPENDENT',
        name: '독립 본부 (사업단 미소속)',
        hqs: hqItems,
        totalEmps: indepTotalEmps
      });
    }

    return divisionsList;
  }, [empList, divisionSettings, availableHqs]);

  // 검색 및 필터 적용
  const filteredTree = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return orgTree
      .filter(div => selectedDivFilter === 'ALL' || div.id === selectedDivFilter || div.name === selectedDivFilter)
      .map(div => {
        const filteredHqs = div.hqs
          .filter(hq => selectedHqFilter === 'ALL' || hq.hqName === selectedHqFilter)
          .map(hq => {
            const hqMatches = !query || hq.hqName.toLowerCase().includes(query);

            const filteredBranches = hq.branches.map(br => {
              const brMatches = !query || br.branchName.toLowerCase().includes(query);
              const filteredEmps = br.emps.filter(emp => {
                if (!query) return true;
                return (
                  emp.name.toLowerCase().includes(query) ||
                  emp.code.toLowerCase().includes(query) ||
                  emp.phone.includes(query) ||
                  emp.branch.toLowerCase().includes(query) ||
                  emp.hq.toLowerCase().includes(query)
                );
              });

              if (hqMatches || brMatches || filteredEmps.length > 0) {
                return {
                  branchName: br.branchName,
                  emps: (hqMatches || brMatches) && filteredEmps.length === 0 ? br.emps : filteredEmps
                };
              }
              return null;
            }).filter(Boolean) as { branchName: string; emps: EmpInfo[] }[];

            if (filteredBranches.length > 0) {
              const count = filteredBranches.reduce((acc, b) => acc + b.emps.length, 0);
              return {
                ...hq,
                branches: filteredBranches,
                empCount: count
              };
            }
            return null;
          }).filter(Boolean) as { hqName: string; branches: { branchName: string; emps: EmpInfo[] }[]; empCount: number }[];

        if (filteredHqs.length > 0) {
          const divTotal = filteredHqs.reduce((acc, h) => acc + h.empCount, 0);
          return {
            ...div,
            hqs: filteredHqs,
            totalEmps: divTotal
          };
        }
        return null;
      }).filter(Boolean) as typeof orgTree;
  }, [orgTree, searchTerm, selectedDivFilter, selectedHqFilter]);

  // 전체 통계
  const stats = useMemo(() => {
    let divCount = 0;
    let hqCount = 0;
    let branchCount = 0;
    let empCount = 0;

    filteredTree.forEach(div => {
      divCount++;
      div.hqs.forEach(hq => {
        hqCount++;
        branchCount += hq.branches.filter(b => b.branchName !== '본부 직속').length;
        empCount += hq.empCount;
      });
    });

    return { divCount, hqCount, branchCount, empCount };
  }, [filteredTree]);

  // 접기/펼치기 토글
  const toggleHqCollapse = (hqName: string) => {
    setCollapsedHqs(prev => {
      const next = new Set(prev);
      if (next.has(hqName)) next.delete(hqName);
      else next.add(hqName);
      return next;
    });
  };

  const toggleBranchCollapse = (branchKey: string) => {
    setCollapsedBranches(prev => {
      const next = new Set(prev);
      if (next.has(branchKey)) next.delete(branchKey);
      else next.add(branchKey);
      return next;
    });
  };

  const expandAll = () => {
    setCollapsedHqs(new Set());
    setCollapsedBranches(new Set());
  };

  const collapseAll = () => {
    const allHqSet = new Set<string>();
    const allBrSet = new Set<string>();
    orgTree.forEach(d => {
      d.hqs.forEach(h => {
        allHqSet.add(h.hqName);
        h.branches.forEach(b => allBrSet.add(`${h.hqName}_${b.branchName}`));
      });
    });
    setCollapsedHqs(allHqSet);
    setCollapsedBranches(allBrSet);
  };

  // 클립보드 복사 헬퍼
  const copyToClipboard = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 1800);
  };

  // 4. 고해상도 이미지(PNG) 내보내기
  const handleExportImage = async () => {
    if (!chartRef.current) return;
    setIsExportingImage(true);

    try {
      // 이미지 내보내기 전 모든 노드 펼치기
      expandAll();
      await new Promise(r => setTimeout(r, 200));

      const dataUrl = await htmlToImage.toPng(chartRef.current, {
        backgroundColor: '#f8fafc',
        quality: 1,
        pixelRatio: 2, // 2배 고해상도
      });

      const link = document.createElement('a');
      const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      link.download = `더좋은라이프_조직도_${todayStr}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('[OrganizationChartModal] 이미지 내보내기 실패:', err);
      alert('이미지 생성 도중 오류가 발생했습니다. 브라우저 크기나 배율을 조절한 후 다시 시도해 주세요.');
    } finally {
      setIsExportingImage(false);
    }
  };

  // 5. 엑셀 다운로드 핸들러
  const handleExportExcel = () => {
    try {
      const rows: any[][] = [
        ['사업단', '본부명', '지사명', '사원코드', '사원명', '휴대폰번호', '아이디(계정)', '비밀번호', '권한']
      ];

      filteredTree.forEach(div => {
        div.hqs.forEach(hq => {
          hq.branches.forEach(br => {
            if (br.emps.length === 0) {
              // 사원이 없는 지사인 경우 지사/본부 계정 매핑하여 1줄 추가
              const brAccounts = findAccountsForTarget('branch', br.branchName, { hq: hq.hqName });
              const hqAccounts = findAccountsForTarget('hq', hq.hqName);
              const acc = brAccounts[0] || hqAccounts[0];

              rows.push([
                div.name,
                hq.hqName,
                br.branchName,
                '-',
                '-',
                '-',
                acc ? acc.username : '-',
                acc ? acc.password : '-',
                acc ? acc.role : '-'
              ]);
            } else {
              br.emps.forEach(emp => {
                const empAccounts = findAccountsForTarget('emp', emp.name, {
                  code: emp.code,
                  phone: emp.phone,
                  hq: emp.hq,
                  branch: emp.branch
                });
                const acc = empAccounts[0];

                rows.push([
                  div.name,
                  hq.hqName,
                  br.branchName,
                  emp.code || '-',
                  emp.name || '-',
                  formatPhone(emp.phone) || '-',
                  acc ? acc.username : '-',
                  acc ? acc.password : '-',
                  acc ? acc.role : '-'
                ]);
              });
            }
          });
        });
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);

      // 열 너비 자동 계산
      const colWidths = rows.reduce((acc, row) => {
        row.forEach((cell, i) => {
          const str = cell !== null && cell !== undefined ? String(cell) : '';
          const len = str.split('').reduce((a: number, c: string) => a + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
          if (!acc[i] || len > acc[i]) acc[i] = len;
        });
        return acc;
      }, [] as number[]);
      ws['!cols'] = colWidths.map(w => ({ wch: Math.min(Math.max(w + 3, 10), 35) }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "조직도");

      const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      XLSX.writeFile(wb, `더좋은라이프_조직도_${todayStr}.xlsx`);
    } catch (err) {
      console.error('[OrganizationChartModal] 엑셀 내보내기 실패:', err);
      alert('엑셀 생성 도중 오류가 발생했습니다.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden">
      {/* 배경 오버레이 */}
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
        className="relative bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 w-[98vw] max-w-[1720px] max-h-[96vh] flex flex-col overflow-hidden z-10"
      >
        {/* 상단 헤더 */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200">
              <FolderTree size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 tracking-tight">통합 영업 조직도</h2>
                <span className="text-xs font-bold px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
                  사업단 · 본부 · 지사 · 사원
                </span>
                <span className="text-xs font-medium text-slate-400">
                  (클릭 시 계정 및 비밀번호 확인)
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                사원리스트 시트와 조직계정설정을 실시간 연동하여 전체 조직 계층과 계정 정보를 시각화합니다.
              </p>
            </div>
          </div>

          {/* 액션 버튼 툴바 */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={expandAll}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
            >
              전체 펼치기
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
            >
              전체 접기
            </button>

            <div className="h-4 w-px bg-slate-200 mx-1" />

            {/* 이미지 저장 버튼 */}
            <button
              onClick={handleExportImage}
              disabled={isExportingImage}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="현재 조직도를 고해상도 PNG 이미지로 저장합니다."
            >
              {isExportingImage ? <RefreshCw size={13} className="animate-spin" /> : <ImageIcon size={13} />}
              <span>{isExportingImage ? '이미지 생성 중...' : '이미지 저장 (PNG)'}</span>
            </button>

            {/* 엑셀 다운로드 버튼 */}
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              title="전체 조직도 및 계정 정보 목록을 엑셀로 다운로드합니다."
            >
              <Download size={13} />
              <span>엑셀 다운로드</span>
            </button>

            {/* 닫기 버튼 */}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer ml-1"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 필터 및 요약 바 */}
        <div className="px-6 py-3 bg-slate-100/90 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 검색창 */}
            <div className="relative w-64 sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="사원명, 사원코드, 본부, 지사, 전화번호 검색..."
                className="w-full pl-9 pr-7 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shadow-2xs transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold"
                >
                  ×
                </button>
              )}
            </div>

            {/* 사업단 필터 */}
            <select
              value={selectedDivFilter}
              onChange={e => {
                setSelectedDivFilter(e.target.value);
                setSelectedHqFilter('ALL');
              }}
              className="py-1.5 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-2xs"
            >
              <option value="ALL">전체 사업단</option>
              {orgTree.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>

            {/* 본부 필터 */}
            <select
              value={selectedHqFilter}
              onChange={e => setSelectedHqFilter(e.target.value)}
              className="py-1.5 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-2xs"
            >
              <option value="ALL">전체 본부</option>
              {Array.from(new Set(orgTree.flatMap(d => d.hqs.map(h => h.hqName)))).sort().map(hq => (
                <option key={hq} value={hq}>{hq}</option>
              ))}
            </select>
          </div>

          {/* 통계 배지 */}
          <div className="flex items-center gap-2 font-bold text-slate-600 shrink-0">
            <span className="px-2.5 py-1 bg-white rounded-lg border border-slate-200 shadow-2xs">
              사업단 <strong className="text-indigo-600">{stats.divCount}</strong>개
            </span>
            <span className="px-2.5 py-1 bg-white rounded-lg border border-slate-200 shadow-2xs">
              본부 <strong className="text-blue-600">{stats.hqCount}</strong>개
            </span>
            <span className="px-2.5 py-1 bg-white rounded-lg border border-slate-200 shadow-2xs">
              지사 <strong className="text-emerald-600">{stats.branchCount}</strong>개
            </span>
            <span className="px-2.5 py-1 bg-white rounded-lg border border-slate-200 shadow-2xs">
              총 사원 <strong className="text-slate-900">{stats.empCount}</strong>명
            </span>
          </div>
        </div>

        {/* 본문 조직도 캔버스 영역 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
              <RefreshCw size={32} className="animate-spin text-indigo-500" />
              <p className="text-sm font-bold">사원리스트 및 조직 데이터를 불러오는 중입니다...</p>
            </div>
          )}

          {loadError && !isLoading && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl text-center text-xs font-bold">
              {loadError}
            </div>
          )}

          {!isLoading && !loadError && (
            <div ref={chartRef} className="space-y-8 p-4 bg-slate-50 rounded-2xl">
              {filteredTree.map(division => (
                <div 
                  key={division.id}
                  className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden"
                >
                  {/* 1단계: 사업단 헤더 */}
                  <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-200">
                        <Layers size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black tracking-tight">{division.name}</h3>
                          <span className="text-[11px] font-bold px-2 py-0.5 bg-white/10 rounded-full border border-white/20 text-indigo-200">
                            소속 본부 {division.hqs.length}개
                          </span>
                        </div>
                        <p className="text-[11px] text-indigo-200/80 mt-0.5">
                          총 사원수: <strong>{division.totalEmps}</strong>명
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 2단계: 본부 및 지사 그리드 */}
                  <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6 bg-slate-50/50">
                    {division.hqs.map(hq => {
                      const isCollapsed = collapsedHqs.has(hq.hqName);
                      const hqAccounts = findAccountsForTarget('hq', hq.hqName);

                      return (
                        <div 
                          key={hq.hqName}
                          className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col transition-all hover:shadow-md"
                        >
                          {/* 본부 헤더 바 */}
                          <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white px-4 py-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                              <button
                                onClick={() => toggleHqCollapse(hq.hqName)}
                                className="p-1 hover:bg-white/10 rounded-lg transition-colors text-blue-200 cursor-pointer shrink-0"
                                title={isCollapsed ? '펼치기' : '접기'}
                              >
                                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                              </button>
                              
                              <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
                                <Building2 size={16} className="text-blue-200" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-black text-sm tracking-tight truncate text-white">
                                    {hq.hqName}
                                  </span>
                                  <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-400/20 border border-blue-300/30 rounded-full text-blue-200 shrink-0">
                                    지사 {hq.branches.filter(b => b.branchName !== '본부 직속').length}개
                                  </span>
                                  <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-400/20 border border-emerald-300/30 rounded-full text-emerald-200 shrink-0">
                                    사원 {hq.empCount}명
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* 본부 계정 확인 버튼 */}
                            <button
                              onClick={() => setInspectTarget({
                                type: 'hq',
                                name: hq.hqName,
                                subTitle: `${division.name} 소속 본부`,
                                matchedAccounts: hqAccounts
                              })}
                              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer shrink-0 ${
                                hqAccounts.length > 0 
                                  ? 'bg-amber-400 text-amber-950 hover:bg-amber-300 shadow-sm' 
                                  : 'bg-white/10 text-white/60 hover:bg-white/20'
                              }`}
                              title="본부 로그인 계정 및 비밀번호 확인"
                            >
                              <KeyRound size={12} />
                              <span>{hqAccounts.length > 0 ? '계정 확인' : '계정 없음'}</span>
                            </button>
                          </div>

                          {/* 본부 본체 (지사 & 사원 목록) */}
                          {!isCollapsed && (
                            <div className="p-4 space-y-4 flex-1">
                              {hq.branches.map(branch => {
                                const branchKey = `${hq.hqName}_${branch.branchName}`;
                                const isBranchCollapsed = collapsedBranches.has(branchKey);
                                const branchAccounts = findAccountsForTarget('branch', branch.branchName, { hq: hq.hqName });

                                return (
                                  <div 
                                    key={branch.branchName}
                                    className="bg-slate-50/80 rounded-xl border border-slate-200/80 overflow-hidden"
                                  >
                                    {/* 3단계: 지사 헤더 */}
                                    <div className="px-3.5 py-2.5 bg-slate-100 border-b border-slate-200/80 flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <button
                                          onClick={() => toggleBranchCollapse(branchKey)}
                                          className="p-0.5 hover:bg-slate-200 rounded transition-colors text-slate-500 cursor-pointer shrink-0"
                                          title={isBranchCollapsed ? '펼치기' : '접기'}
                                        >
                                          {isBranchCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                        </button>

                                        <span className="font-bold text-xs text-slate-800 truncate">
                                          {branch.branchName}
                                        </span>

                                        <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200 shrink-0">
                                          {branch.emps.length}명
                                        </span>
                                      </div>

                                      {/* 지사 계정 확인 버튼 */}
                                      <button
                                        onClick={() => setInspectTarget({
                                          type: 'branch',
                                          name: branch.branchName,
                                          subTitle: `${hq.hqName} 소속 지사`,
                                          matchedAccounts: branchAccounts
                                        })}
                                        className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all flex items-center gap-1 cursor-pointer shrink-0 ${
                                          branchAccounts.length > 0
                                            ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
                                            : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                                        }`}
                                        title="지사 로그인 계정 및 비밀번호 확인"
                                      >
                                        <KeyRound size={11} />
                                        <span>{branchAccounts.length > 0 ? '지사 계정' : '계정 미등록'}</span>
                                      </button>
                                    </div>

                                    {/* 4단계: 사원 카드 그리드 */}
                                    {!isBranchCollapsed && (
                                      <div className="p-3">
                                        {branch.emps.length === 0 ? (
                                          <p className="text-[11px] text-slate-400 text-center py-2">소속 사원이 없습니다.</p>
                                        ) : (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {branch.emps.map((emp, empIdx) => {
                                              const empAccounts = findAccountsForTarget('emp', emp.name, {
                                                code: emp.code,
                                                phone: emp.phone,
                                                hq: emp.hq,
                                                branch: emp.branch
                                              });

                                              return (
                                                <div
                                                  key={`${emp.code || emp.name}_${empIdx}`}
                                                  onClick={() => setInspectTarget({
                                                    type: 'emp',
                                                    name: emp.name,
                                                    subTitle: `${emp.hq} > ${emp.branch} (사원코드: ${emp.code || '-'})`,
                                                    matchedAccounts: empAccounts
                                                  })}
                                                  className="bg-white p-2.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between gap-2 group"
                                                >
                                                  <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                      <span className="font-bold text-xs text-slate-900 group-hover:text-indigo-600 transition-colors">
                                                        {emp.name}
                                                      </span>
                                                      {emp.code && (
                                                        <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded border border-slate-200">
                                                          {emp.code}
                                                        </span>
                                                      )}
                                                      {emp.position && emp.position !== '-' && (
                                                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded">
                                                          {emp.position}
                                                        </span>
                                                      )}
                                                    </div>
                                                    {emp.phone && (
                                                      <p className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-1">
                                                        <Phone size={10} className="text-slate-400" />
                                                        {formatPhone(emp.phone)}
                                                      </p>
                                                    )}
                                                  </div>

                                                  <div className="shrink-0">
                                                    <span 
                                                      className={`p-1 rounded-md flex items-center gap-0.5 text-[10px] font-bold ${
                                                        empAccounts.length > 0 
                                                          ? 'text-amber-700 bg-amber-50 border border-amber-200 group-hover:bg-amber-100' 
                                                          : 'text-slate-400 bg-slate-50'
                                                      }`}
                                                      title="클릭하여 계정/비밀번호 확인"
                                                    >
                                                      <KeyRound size={11} />
                                                    </span>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {filteredTree.length === 0 && (
                <div className="py-20 text-center text-slate-400 font-bold">
                  검색 조건에 일치하는 조직 정보가 없습니다.
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* 계정/비밀번호 확인 상세 팝오버 모달 */}
      <AnimatePresence>
        {inspectTarget && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInspectTarget(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden z-10 flex flex-col"
            >
              {/* 팝업 헤더 */}
              <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center">
                    <KeyRound size={16} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                      <span>{inspectTarget.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-white/20 rounded font-normal text-slate-200">
                        {inspectTarget.type === 'hq' ? '본부' : inspectTarget.type === 'branch' ? '지사' : '사원'}
                      </span>
                    </h4>
                    {inspectTarget.subTitle && (
                      <p className="text-[11px] text-slate-400 mt-0.5">{inspectTarget.subTitle}</p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setInspectTarget(null)}
                  className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 팝업 바디 */}
              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                {inspectTarget.matchedAccounts.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-xs font-bold text-slate-500">
                      구글 시트 [조직계정설정]에 등록된 계정이 없습니다.
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      상단 [계정 관리] 메뉴에서 신규 계정을 등록하거나 계정 자동생성 마법사를 이용해 주세요.
                    </p>
                  </div>
                ) : (
                  inspectTarget.matchedAccounts.map((acc, accIdx) => {
                    const pwKey = `${acc.username}_${accIdx}`;
                    const isPwVisible = showPasswordMap[pwKey] || false;

                    return (
                      <div 
                        key={pwKey}
                        className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3"
                      >
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <span className="text-xs font-black text-slate-800">
                            계정 #{accIdx + 1}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                            {acc.role || '일반'} ({acc.orgName})
                          </span>
                        </div>

                        {/* 아이디 */}
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">로그인 아이디</label>
                          <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200">
                            <span className="font-mono text-xs font-bold text-slate-900 select-all">
                              {acc.username}
                            </span>
                            <button
                              onClick={() => copyToClipboard(acc.username, `user_${pwKey}`)}
                              className="text-slate-400 hover:text-indigo-600 p-1 rounded transition-colors flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                              title="아이디 복사"
                            >
                              {copiedField === `user_${pwKey}` ? (
                                <><Check size={12} className="text-emerald-600" /><span className="text-emerald-600">복사됨</span></>
                              ) : (
                                <><Copy size={12} /><span>복사</span></>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* 비밀번호 */}
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1">비밀번호</label>
                          <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200">
                            <span className="font-mono text-xs font-bold text-slate-900 select-all">
                              {isPwVisible ? acc.password : '••••••••'}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setShowPasswordMap(prev => ({ ...prev, [pwKey]: !prev[pwKey] }))}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors"
                                title={isPwVisible ? '숨기기' : '보기'}
                              >
                                {isPwVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                              </button>
                              <button
                                onClick={() => copyToClipboard(acc.password, `pw_${pwKey}`)}
                                className="text-slate-400 hover:text-indigo-600 p-1 rounded transition-colors flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                                title="비밀번호 복사"
                              >
                                {copiedField === `pw_${pwKey}` ? (
                                  <><Check size={12} className="text-emerald-600" /><span className="text-emerald-600">복사됨</span></>
                                ) : (
                                  <><Copy size={12} /><span>복사</span></>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* 팝업 푸터 */}
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
                <button
                  onClick={() => setInspectTarget(null)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
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
