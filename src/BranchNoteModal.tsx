import React, { useState, useEffect } from 'react';
import { X, Printer, Save, Plus, Minus, Loader2, Calendar, Building2, ChevronRight, Check, Trash2, AlertCircle, Edit2 } from 'lucide-react';
import { motion } from 'motion/react';

interface BranchNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  hqs: string[]; // 상위의 uniqueHqs를 받음
}

interface NoteData {
  orgName: string;
  note: string;
  report: string;
}

interface NoteGroup {
  id: string;
  orgNames: string[];
  note: string;
  report: string;
}

export function BranchNoteModal({ isOpen, onClose, hqs }: BranchNoteModalProps) {
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 본부 목록 상태 (Prop으로 받은 hqs + 사용자가 임시 추가한 본부)
  const [addedHqs, setAddedHqs] = useState<string[]>([]);
  const [newHqInput, setNewHqInput] = useState('');

  // 작성된 본부 그룹 목록 상태
  const [groups, setGroups] = useState<NoteGroup[]>([]);

  // 현재 작성 영역 상태
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [currentNote, setCurrentNote] = useState('');
  const [currentReport, setCurrentReport] = useState('');

  // 결재라인 직급 정보 (기본 3단계)
  const [signLines, setSignLines] = useState<string[]>(['담당', '검토', '승인']);
  const [editingSignIdx, setEditingSignIdx] = useState<number | null>(null);
  const [tempSignText, setTempSignText] = useState('');

  // 1. 전체 본부 리스트 (기본 본부 + 수동 추가 본부)
  const allHqs = React.useMemo(() => {
    const baseSet = new Set([...hqs, ...addedHqs]);
    return Array.from(baseSet).sort();
  }, [hqs, addedHqs]);

  // 2. 이미 어느 그룹에든 작성된 본부 목록
  const assignedOrgs = React.useMemo(() => {
    const orgs: string[] = [];
    groups.forEach(g => {
      orgs.push(...g.orgNames);
    });
    return orgs;
  }, [groups]);

  // 3. 특정 날짜의 특이사항 데이터 가져오기 및 그룹화
  const fetchNotes = async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sheets/branch-notes?date=${date}`);
      if (!res.ok) throw new Error('데이터 로드 실패');
      const data = await res.json();
      
      const loadedNotes: NoteData[] = data.notes || [];

      // 불러온 데이터 중에 기존 hqs에 없는 본부명이 있다면 addedHqs에 추가
      const loadedHqNames = loadedNotes.map(item => item.orgName);
      const extraHqs = loadedHqNames.filter(name => !hqs.includes(name));
      if (extraHqs.length > 0) {
        setAddedHqs(prev => {
          const combined = new Set([...prev, ...extraHqs]);
          return Array.from(combined);
        });
      }

      // 불러온 개별 데이터를 동일한 [특이사항 + 보고사항]을 기준으로 그룹화
      const groupMap: Record<string, { orgNames: string[]; note: string; report: string }> = {};
      
      loadedNotes.forEach(item => {
        const note = (item.note || '').trim();
        const report = (item.report || '').trim();

        const key = `${note}%%%${report}`;
        if (!groupMap[key]) {
          groupMap[key] = {
            orgNames: [],
            note,
            report
          };
        }
        groupMap[key].orgNames.push(item.orgName);
      });

      const parsedGroups: NoteGroup[] = Object.entries(groupMap).map(([key, value], idx) => ({
        id: `group-${idx}-${Date.now()}`,
        orgNames: value.orgNames,
        note: value.note,
        report: value.report
      }));

      setGroups(parsedGroups);
      // 대기 중인 입력 폼 초기화
      setSelectedOrgs([]);
      setCurrentNote('');
      setCurrentReport('');
    } catch (e) {
      console.error(e);
      alert('특이사항 및 보고사항을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotes(selectedDate);
    }
  }, [selectedDate, isOpen]);

  // 4. 본부 수동 추가 핸들러
  const handleAddHq = () => {
    const trimmedName = newHqInput.trim();
    if (!trimmedName) {
      alert('추가할 본부명을 입력해 주세요.');
      return;
    }
    if (allHqs.includes(trimmedName)) {
      alert('이미 목록에 존재하는 본부명입니다.');
      return;
    }

    setAddedHqs(prev => [...prev, trimmedName]);
    // 수동 추가 시 자동으로 현재 작성 선택에 추가되게 편의성 제공
    setSelectedOrgs(prev => [...prev, trimmedName]);
    setNewHqInput('');
  };

  // 5. 작성 내역에 추가 (그룹 등록)
  const handleAddGroup = () => {
    if (selectedOrgs.length === 0) {
      alert('작성할 본부를 최소 하나 이상 선택해 주세요.');
      return;
    }
    const trimmedNote = currentNote.trim();
    const trimmedReport = currentReport.trim();

    const newGroup: NoteGroup = {
      id: `group-${Date.now()}`,
      orgNames: [...selectedOrgs],
      note: trimmedNote,
      report: trimmedReport
    };

    setGroups(prev => [...prev, newGroup]);
    // 입력 폼 및 선택된 본부 해제
    setSelectedOrgs([]);
    setCurrentNote('');
    setCurrentReport('');
  };

  // 6. 그룹 삭제 핸들러
  const handleDeleteGroup = (groupId: string) => {
    setGroups(prev => prev.filter(g => g.id !== groupId));
  };

  // 6-2. 그룹 수정 핸들러 (작성된 내용을 작성 폼으로 다시 로드)
  const handleEditGroup = (group: NoteGroup) => {
    if (selectedOrgs.length > 0 || currentNote.trim() || currentReport.trim()) {
      const confirmOverwrite = window.confirm("현재 작성 중인 내용이 있습니다. 작성 내역의 항목을 불러와서 수정하시겠습니까?");
      if (!confirmOverwrite) return;
    }
    
    setGroups(prev => prev.filter(g => g.id !== group.id));
    setSelectedOrgs(group.orgNames);
    setCurrentNote(group.note);
    setCurrentReport(group.report);
  };

  // 7. 저장 API 호출 (스프레드시트에 본부별 개별 행으로 풀어서 전송)
  const handleSave = async () => {
    setSaving(true);
    try {
      const notesList: NoteData[] = [];
      groups.forEach(g => {
        g.orgNames.forEach(orgName => {
          notesList.push({
            orgName,
            note: g.note,
            report: g.report
          });
        });
      });

      const res = await fetch('/api/sheets/branch-notes/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          date: selectedDate,
          notes: notesList
        })
      });

      if (!res.ok) throw new Error('저장 실패');
      alert('본부별 특이사항 및 보고사항이 구글 시트에 정상 저장되었습니다.');
      fetchNotes(selectedDate);
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 8. 인쇄 기능 (독립 인쇄 세션으로 부모 어플리케이션 레이아웃 간섭 100% 차단)
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) {
      window.print();
      return;
    }

    // 결재란 HTML 구성
    const signCellsHtml = signLines.map((line, idx) => `
      <div style="width: 75px; display: flex; flex-direction: column; border-right: ${idx === signLines.length - 1 ? 'none' : '1px solid #000'};">
        <div style="background: #f8fafc; border-bottom: 1px solid #000; font-size: 11px; font-weight: bold; text-align: center; padding: 3px 0; height: 24px; display: flex; align-items: center; justify-content: center;">
          ${line}
        </div>
        <div style="height: 52px; background: #fff;"></div>
      </div>
    `).join('');

    // 본부 보고 카드 HTML 구성
    const groupsHtml = groups.map((g) => {
      const orgsText = g.orgNames.join(', ');
      const hasNote = !!g.note?.trim();
      const hasReport = !!g.report?.trim();

      let contentHtml = '';
      if (hasNote || !hasReport) {
        contentHtml += `
          <div style="margin-bottom: 10px;">
            <div style="font-size: 11px; font-weight: bold; color: #475569; margin-bottom: 4px;">[ 특이사항 ]</div>
            <div style="white-space: pre-wrap; font-size: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; min-height: 44px; color: #0f172a;">${g.note || '특이사항 없음'}</div>
          </div>
        `;
      }
      if (hasReport) {
        contentHtml += `
          <div style="margin-bottom: 10px;">
            <div style="font-size: 11px; font-weight: bold; color: #475569; margin-bottom: 4px;">[ 보고사항 ]</div>
            <div style="white-space: pre-wrap; font-size: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; min-height: 44px; color: #0f172a;">${g.report}</div>
          </div>
        `;
      }

      return `
        <div style="background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 20px; page-break-inside: avoid; break-inside: avoid;">
          <div style="font-size: 15px; font-weight: 900; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 12px;">
            ${orgsText}
          </div>
          ${contentHtml}
        </div>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>영업조직 운영 보고서</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm 15mm 15mm 15mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
              font-family: apple-system, BlinkMacSystemFont, "Malgun Gothic", "맑은 고딕", helvetica, sans-serif;
            }
            body {
              background: #fff;
              color: #0f172a;
              width: 100%;
              padding: 0;
            }
            .header-row {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 24px;
              padding-bottom: 12px;
              border-bottom: 2px solid #0f172a;
            }
            .title-box {
              font-size: 22px;
              font-weight: 900;
              color: #0f172a;
              padding-top: 10px;
            }
            .right-section {
              display: flex;
              flex-direction: column;
              align-items: flex-end;
              gap: 6px;
            }
            .date-text {
              font-size: 13px;
              font-weight: 700;
              color: #334155;
            }
            .approval-table {
              display: flex;
              border: 2px solid #000;
              background: #fff;
            }
            .approval-title-cell {
              width: 32px;
              background: #f8fafc;
              border-right: 1px solid #000;
              font-size: 11px;
              font-weight: bold;
              display: flex;
              align-items: center;
              justify-content: center;
              text-align: center;
              line-height: 1.3;
            }
          </style>
        </head>
        <body>
          <div class="header-row">
            <div class="title-box">🏢 영업조직 운영 보고서</div>
            <div class="right-section">
              <div class="date-text">기록 날짜: ${selectedDate}</div>
              <div class="approval-table">
                <div class="approval-title-cell">결<br>재</div>
                <div style="display: flex;">
                  ${signCellsHtml}
                </div>
              </div>
            </div>
          </div>
          <div>
            ${groupsHtml || '<div style="text-align: center; padding: 40px; color: #94a3b8; font-weight: bold;">작성된 보고 내용이 없습니다.</div>'}
          </div>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  // 결재라인 수정 관련 핸들러
  const startEditSign = (idx: number) => {
    setEditingSignIdx(idx);
    setTempSignText(signLines[idx]);
  };

  const saveEditSign = (idx: number) => {
    const next = [...signLines];
    next[idx] = tempSignText.trim() || `단계 ${idx + 1}`;
    setSignLines(next);
    setEditingSignIdx(null);
  };

  const addSignLine = () => {
    if (signLines.length >= 6) return;
    setSignLines([...signLines, '결재']);
  };

  const removeSignLine = () => {
    if (signLines.length <= 1) return;
    setSignLines(signLines.slice(0, -1));
  };

  // 체크박스 제어 핸들러
  const toggleOrgSelection = (org: string) => {
    if (assignedOrgs.includes(org)) return; // 이미 다른 그룹에 작성된 본부는 선택 불가
    setSelectedOrgs(prev => 
      prev.includes(org) ? prev.filter(o => o !== org) : [...prev, org]
    );
  };

  const handleSelectAllAvailable = () => {
    const available = allHqs.filter(org => !assignedOrgs.includes(org));
    setSelectedOrgs(available);
  };

  const handleClearSelection = () => {
    setSelectedOrgs([]);
  };

  if (!isOpen) return null;

  return (
    <div id="print-modal-wrapper" className="fixed inset-0 z-[60] flex items-center justify-center p-4 print:static print:p-0 print:block print:h-auto print:overflow-visible">
      {/* 백드롭 (인쇄 시 숨김) */}
      <div 
        onClick={onClose} 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm print:hidden" 
      />

      {/* 모달 박스 */}
      <motion.div
        id="print-branch-report"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative bg-white w-full max-w-6xl h-[90vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 overflow-hidden print:h-auto print:border-none print:shadow-none print:p-0 print:static"
      >


        {/* 헤더 영역 */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col gap-4 print:bg-white print:border-b-2 print:border-slate-800 print:px-2 print:py-2">
          {/* 1행: 제목 & 우측 결재 박스 */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            {/* 좌측: 타이틀 */}
            <div className="flex items-center gap-2 pt-2">
              <Building2 className="text-indigo-600 print:text-slate-800" size={24} />
              <h2 className="text-lg font-black text-slate-800 print:text-2xl">
                영업조직 운영 보고서
              </h2>
            </div>

            {/* 우측: 날짜 + 결재라인 */}
            <div className="flex flex-col items-end gap-1.5 shrink-0 ml-auto print:w-full print:items-end">
              {/* 기록 날짜 & 닫기 버튼 */}
              <div className="flex items-center gap-4">
                <div className="text-xs font-bold text-slate-600 print:text-slate-800 print:text-sm">
                  기록 날짜: <span className="font-black print:font-extrabold">{selectedDate}</span>
                </div>
                <button 
                  onClick={onClose} 
                  className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors print:hidden"
                >
                  <X size={20} />
                </button>
              </div>

              {/* 결재란 단계 추가/삭제 버튼 (화면용) */}
              <div className="flex items-center gap-2 print:hidden">
                <span className="text-[10px] font-bold text-slate-400">결재란 수정: </span>
                <button
                  onClick={addSignLine}
                  className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-md transition-colors"
                >
                  <Plus size={10} />
                </button>
                <button
                  onClick={removeSignLine}
                  className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-md transition-colors"
                >
                  <Minus size={10} />
                </button>
              </div>

              {/* 결재 박스 (순수 검은색 보더 및 굵기 추가) */}
              <div id="approval-box" className="flex border-2 border-black rounded overflow-hidden text-center bg-white shadow-sm print:shadow-none print:border-2 print:border-black print:rounded-none">
                <div className="w-10 bg-slate-100 flex items-center justify-center border-r border-black font-bold text-[10px] text-slate-500 py-1 print:bg-white print:border-black print:text-[11px] print:text-slate-800 print:border-r">
                  결<br />재
                </div>
                <div className="flex">
                  {signLines.map((line, idx) => (
                    <div 
                      key={idx} 
                      className="w-20 flex flex-col border-r border-black last:border-r-0 print:border-black print:border-r last:print:border-r-0"
                    >
                      <div className="bg-slate-50 py-1 px-1 border-b border-black text-[10px] font-bold text-slate-600 flex justify-center items-center h-7 cursor-pointer hover:bg-indigo-50 transition-colors print:bg-white print:border-black print:text-[11px] print:text-slate-800 print:h-6 print:border-b">
                        {editingSignIdx === idx ? (
                          <input
                            type="text"
                            value={tempSignText}
                            onChange={(e) => setTempSignText(e.target.value)}
                            onBlur={() => saveEditSign(idx)}
                            onKeyDown={(e) => e.key === 'Enter' && saveEditSign(idx)}
                            autoFocus
                            className="w-full text-center px-1 py-0.5 border border-indigo-400 text-[10px] rounded outline-none"
                          />
                        ) : (
                          <span 
                            onClick={() => startEditSign(idx)}
                            className="w-full h-full flex items-center justify-center"
                          >
                            {line}
                          </span>
                        )}
                      </div>
                      <div className="h-12 bg-white print:h-14 border-b border-black print:border-b print:border-black last:border-b-0 last:print:border-b-0" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 2행: 화면 전용 편집 도구 (날짜 변경 및 미등록 본부 추가, 인쇄 시 숨김) */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border-t border-slate-200/80 pt-3 print:hidden">
            <div className="flex items-center gap-2 shrink-0">
              <Calendar size={16} className="text-slate-400" />
              <span className="text-xs font-bold text-slate-500">기록 날짜 변경:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="미등록 본부명"
                value={newHqInput}
                onChange={(e) => setNewHqInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddHq()}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition-all w-32 sm:w-40"
              />
              <button
                onClick={handleAddHq}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0"
              >
                <Plus size={12} />
                본부 추가
              </button>
            </div>
          </div>
        </div>

        {/* 바디 영역 - 2단 Grid 레이아웃 (인쇄 시 좌측은 숨기고 우측만 w-full로 렌더링) */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-5 bg-slate-100/50 print:bg-white print:grid-cols-1 print:overflow-visible print:p-0">
          
          {/* [좌측] 작성 도구 (인쇄 시 숨김) */}
          <div id="print-sidebar-form" className="lg:col-span-2 border-r border-slate-200 bg-white p-5 flex flex-col gap-4 overflow-y-auto print:hidden">
            <div>
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5 mb-2">
                <Check className="text-indigo-500" size={16} />
                1. 보고 본부 선택
              </h3>
              
              {/* 미등록 본부 추가 인풋 */}
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  placeholder="미등록 본부명 직접 추가"
                  value={newHqInput}
                  onChange={(e) => setNewHqInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddHq()}
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 transition-all focus:bg-white"
                />
                <button
                  onClick={handleAddHq}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0"
                >
                  추가
                </button>
              </div>

              {/* 본부 체크박스 스크롤 리스트 */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                <div className="px-3 py-2 bg-slate-100/80 border-b border-slate-200 flex justify-between items-center text-[10px] font-bold text-slate-500">
                  <span>선택 목록 ({selectedOrgs.length}개 선택됨)</span>
                  <div className="flex gap-2">
                    <button onClick={handleSelectAllAvailable} className="hover:text-indigo-600 transition-colors">전체 선택</button>
                    <span className="text-slate-300">|</span>
                    <button onClick={handleClearSelection} className="hover:text-indigo-600 transition-colors">선택 해제</button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto p-2 space-y-1">
                  {allHqs.map(org => {
                    const isAssigned = assignedOrgs.includes(org);
                    const isChecked = selectedOrgs.includes(org);
                    return (
                      <label 
                        key={org}
                        className={`flex items-center justify-between p-2 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                          isAssigned 
                            ? 'bg-slate-100/80 text-slate-400 cursor-not-allowed opacity-60' 
                            : isChecked 
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' 
                              : 'bg-white hover:bg-slate-50 border border-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            disabled={isAssigned}
                            checked={isChecked}
                            onChange={() => toggleOrgSelection(org)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                          />
                          <span>{org}</span>
                        </div>
                        {isAssigned && (
                          <span className="text-[9px] font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">작성 완료</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 내용 입력란 */}
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                <Check className="text-indigo-500" size={16} />
                2. 특이사항 및 보고사항 기입
              </h3>
              
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-500">[ 특이사항 ]</label>
                <textarea
                  value={currentNote}
                  onChange={(e) => setCurrentNote(e.target.value)}
                  placeholder="선택한 본부들의 공통 특이사항을 입력하세요."
                  className="w-full h-20 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none resize-none transition-all placeholder-slate-400"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-500">[ 보고사항 ]</label>
                <textarea
                  value={currentReport}
                  onChange={(e) => setCurrentReport(e.target.value)}
                  placeholder="선택한 본부들의 공통 보고사항을 입력하세요."
                  className="w-full h-20 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none resize-none transition-all placeholder-slate-400"
                />
              </div>
            </div>

            <button
              onClick={handleAddGroup}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-sm transition-all flex items-center justify-center gap-1 shrink-0"
            >
              <Plus size={14} />
              작성 내역에 추가
            </button>
          </div>

          {/* [우측] 작성 결과 및 보고서 미리보기 (인쇄 시 이 부분만 w-full로 렌더링됨) */}
          <div id="print-content-area" className="lg:col-span-3 p-6 overflow-y-auto flex flex-col gap-4 print:p-2 print:overflow-visible print:w-full">
            <div className="flex justify-between items-center print:hidden">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                <Building2 className="text-slate-500" size={16} />
                오늘의 보고 작성 내역 미리보기
              </h3>
              <span className="text-[11px] font-bold text-slate-400">
                총 {groups.length}개 그룹 작성됨
              </span>
            </div>

            {loading ? (
              <div className="w-full h-64 flex flex-col items-center justify-center text-slate-500 gap-2">
                <Loader2 className="animate-spin text-indigo-500" size={32} />
                <span className="text-xs font-semibold">데이터를 불러오는 중입니다...</span>
              </div>
            ) : groups.length === 0 ? (
              <div className="w-full h-64 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 gap-2 p-6 bg-white">
                <AlertCircle size={32} className="text-slate-300" />
                <span className="text-xs font-bold">작성된 보고 내용이 없습니다.</span>
                <span className="text-[10px] text-slate-400 text-center">
                  좌측 패널에서 본부를 선택하고 내용을 입력한 뒤,<br />
                  &apos;작성 내역에 추가&apos; 버튼을 눌러 보고서를 구성해 보세요.
                </span>
              </div>
            ) : (
              <div className="space-y-4 print:space-y-6">
                {groups.map((group, idx) => {
                  return (
                    <div 
                      key={group.id} 
                      className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4 relative print:p-0 print:border-none print:shadow-none print-card-avoid"
                    >
                      {/* 그룹 수정 버튼 (인쇄 시 숨김) */}
                      <button
                        onClick={() => handleEditGroup(group)}
                        className="absolute top-4 right-12 p-1.5 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors print:hidden"
                        title="작성 내역 수정"
                      >
                        <Edit2 size={15} />
                      </button>

                      {/* 그룹 삭제 버튼 (인쇄 시 숨김) */}
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        className="absolute top-4 right-4 p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg transition-colors print:hidden"
                        title="작성 내역 삭제"
                      >
                        <Trash2 size={15} />
                      </button>

                      {/* 본부 타이틀 (순수 본부명만 렌더링) */}
                      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3 pr-8 print:border-b-2 print:border-slate-800 print:mb-2 print:pb-1">
                        {group.orgNames.map((name) => (
                          <span 
                            key={name}
                            className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-lg text-xs font-extrabold border border-slate-200/60 print:bg-white print:border-none print:px-0 print:text-base print:after:content-[',_'] print:last:after:content-none"
                          >
                            {name}
                          </span>
                        ))}
                      </div>

                      {/* 특이사항 & 보고사항 Grid 또는 100% 레이아웃 */}
                      {(() => {
                        const hasNote = !!group.note?.trim();
                        const hasReport = !!group.report?.trim();
                        const showBoth = (hasNote && hasReport) || (!hasNote && !hasReport);

                        return (
                          <div className={showBoth ? "grid grid-cols-1 md:grid-cols-2 gap-4 grid-cols-2-print" : "flex flex-col gap-4"}>
                            {/* 특이사항 */}
                            {(hasNote || !hasReport) && (
                              <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-[11px] font-bold text-slate-400 print:text-xs print:text-slate-800">
                                  [ 특이사항 ]
                                </label>
                                <div className="whitespace-pre-wrap min-h-[50px] text-slate-800 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100 print:bg-white print:border-slate-200 print:p-2 print:rounded w-full">
                                  {group.note || '특이사항 없음'}
                                </div>
                              </div>
                            )}

                            {/* 보고사항 */}
                            {(hasReport || !hasNote) && (
                              <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-[11px] font-bold text-slate-400 print:text-xs print:text-slate-800">
                                  [ 보고사항 ]
                                </label>
                                <div className="whitespace-pre-wrap min-h-[50px] text-slate-800 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100 print:bg-white print:border-slate-200 print:p-2 print:rounded w-full">
                                  {group.report || '보고사항 없음'}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 푸터 영역 (인쇄 시 숨김) */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between print:hidden">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
            disabled={loading || saving}
          >
            <Printer size={14} />
            인쇄 (보고서 출력)
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
              disabled={saving}
            >
              닫기
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm hover:shadow transition-all disabled:opacity-50"
              disabled={loading || saving || groups.length === 0}
            >
              {saving ? (
                <>
                  <Loader2 className="animate-spin" size={14} />
                  저장 중...
                </>
              ) : (
                <>
                  <Save size={14} />
                  스프레드시트에 저장
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
