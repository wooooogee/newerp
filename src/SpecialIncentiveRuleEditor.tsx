import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, Globe, Package } from 'lucide-react';
import { GlobalIncentiveRule } from './App';

interface SpecialIncentiveRuleEditorProps {
  rule: GlobalIncentiveRule;
  idx: number;
  divisionSettings: any[];
  hqSettings: any[];
  onUpdateRule: (updated: GlobalIncentiveRule) => void;
  onDeleteRule: () => void;
  onOpenTargetItemsModal: () => void;
}

export const SpecialIncentiveRuleEditor: React.FC<SpecialIncentiveRuleEditorProps> = ({
  rule,
  idx,
  divisionSettings,
  hqSettings,
  onUpdateRule,
  onDeleteRule,
  onOpenTargetItemsModal,
}) => {
  // 로컬 편집 상태 (Draft State) - 타이핑 시 App 전체 리렌더링 및 무거운 정산 재연산 방지
  const [draft, setDraft] = useState<GlobalIncentiveRule>(rule);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestDraftRef = useRef<GlobalIncentiveRule>(draft);
  latestDraftRef.current = draft;

  // 외부에서 선택된 rule의 id가 바뀌었을 때만 로컬 draft 동기화
  useEffect(() => {
    setDraft(rule);
  }, [rule.id]);

  // 상위 상태로 디바운스 동기화 (300ms)
  const commitToParent = useCallback((updated: GlobalIncentiveRule) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onUpdateRule(updated);
    }, 300);
  }, [onUpdateRule]);

  // 포커스 벗어날 때 즉시 커밋
  const handleBlur = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onUpdateRule(latestDraftRef.current);
  }, [onUpdateRule]);

  // 필드 업데이트 헬퍼
  const updateDraft = (updater: (prev: GlobalIncentiveRule) => GlobalIncentiveRule, immediate = false) => {
    setDraft((prev) => {
      const next = updater(prev);
      latestDraftRef.current = next;
      if (immediate) {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        onUpdateRule(next);
      } else {
        commitToParent(next);
      }
      return next;
    });
  };

  const isCustomPerson =
    draft.targetName &&
    draft.targetName !== 'SELF_HQ' &&
    draft.targetName !== '해당본부' &&
    draft.targetName !== '판매본부' &&
    draft.targetName.trim() !== '';

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <div className="relative bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col gap-5 overflow-hidden">
        {/* 상단 뱃지 & 헤더 툴바 */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full text-xs font-black tracking-wide shadow-sm">
              수당 정책 #{idx + 1}
            </span>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 flex-wrap">
              <span>{draft.incentiveName || '수당 명칭 미입력'}</span>
              <span className="text-xs font-normal text-slate-400">
                ({isCustomPerson ? `개인 수급 지정: ${draft.targetName}` : '실적 본부 직접 정산'})
              </span>
              {(draft.targetDivisions || []).length > 0 && (
                <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-[11px] font-bold flex items-center gap-1">
                  <span>🏢</span>
                  <span>
                    {(draft.targetDivisions || [])
                      .map((divId) => {
                        const d = (divisionSettings || []).find((item) => item.id === divId || item.name === divId);
                        return d ? d.name : divId;
                      })
                      .join(', ')}{' '}
                    사업단 일괄 적용
                  </span>
                </span>
              )}
            </h3>
          </div>
          <button
            onClick={onDeleteRule}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all flex items-center gap-1 text-xs font-bold cursor-pointer"
            title="규칙 삭제"
          >
            <X size={18} /> 삭제
          </button>
        </div>

        {/* 1. 기본 정보 & 정산 대상 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">수당 명칭 (종류)</label>
            <input
              type="text"
              placeholder="예: 공급 수수료, 모델비, 컨설팅비"
              value={draft.incentiveName ?? ''}
              onBlur={handleBlur}
              onChange={(e) => {
                const val = e.target.value;
                updateDraft((prev) => ({ ...prev, incentiveName: val }));
              }}
              className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs font-bold transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">수수료 정산 대상</label>
            <div className="flex gap-2">
              <select
                value={isCustomPerson ? 'PERSON' : 'HQ'}
                onChange={(e) => {
                  const val = e.target.value;
                  updateDraft(
                    (prev) => ({
                      ...prev,
                      targetName: val === 'HQ' ? '해당본부' : '신규 대상자',
                    }),
                    true
                  );
                }}
                className="w-1/2 px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs font-bold transition-all"
              >
                <option value="HQ">본부 직접 지급</option>
                <option value="PERSON">특정 개인 지정</option>
              </select>
              {isCustomPerson ? (
                <input
                  type="text"
                  placeholder="성명 (예: 조재윤)"
                  value={draft.targetName ?? ''}
                  onBlur={handleBlur}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateDraft((prev) => ({ ...prev, targetName: val }));
                  }}
                  className="w-1/2 px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs font-bold transition-all"
                />
              ) : (
                <div className="w-1/2 px-3 py-2 bg-slate-100 border border-slate-200/60 rounded-xl text-slate-500 text-xs font-bold flex items-center justify-center">
                  실적 본부로 정산
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">수수료 지급일</label>
            <div className="flex items-center gap-2">
              <select
                value={Number(draft.payDay || 0) === 0 ? 'SAME' : 'CUSTOM'}
                onChange={(e) => {
                  const val = e.target.value;
                  const newDay = val === 'SAME' ? 0 : Number(draft.payDay) > 0 ? Number(draft.payDay) : 25;
                  updateDraft((prev) => ({ ...prev, payDay: newDay }), true);
                }}
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              >
                <option value="SAME">기존 정산 지급일과 동일 (연동)</option>
                <option value="CUSTOM">지정일 (다음달 N일)</option>
              </select>
              {Number(draft.payDay || 0) !== 0 && (
                <div className="relative w-20">
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={draft.payDay || 25}
                    onBlur={handleBlur}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 0;
                      updateDraft((prev) => ({ ...prev, payDay: val }));
                    }}
                    className="w-full px-2 py-2 bg-white border border-slate-200 rounded-xl text-right pr-5 outline-none focus:ring-2 focus:ring-blue-500/20 text-xs font-bold"
                  />
                  <span className="absolute right-1.5 top-2 text-slate-400 text-xs font-bold">일</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. 적용 대상 선택 (본부 / 상품 / 제품 / 기준일) */}
        <div>
          <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            🎯 적용 대상 필터링
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 대상 사업단 / 본부 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-600">대상 사업단 / 본부</label>
                {divisionSettings && divisionSettings.length > 0 && (
                  <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                    🏢 사업단 일괄
                  </span>
                )}
              </div>
              <select
                value=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  updateDraft((prev) => {
                    let nextHqs = Array.isArray(prev.targetHqs) ? [...prev.targetHqs] : ['ALL'];
                    let nextDivs = Array.isArray(prev.targetDivisions) ? [...prev.targetDivisions] : [];

                    if (val === 'ALL') {
                      nextHqs = ['ALL'];
                      nextDivs = [];
                    } else if (val.startsWith('DIV:')) {
                      const divId = val.substring(4);
                      nextHqs = nextHqs.filter((x) => x !== 'ALL');
                      if (!nextDivs.includes(divId)) nextDivs.push(divId);
                    } else if (val.startsWith('HQ:')) {
                      const hqName = val.substring(3);
                      nextHqs = nextHqs.filter((x) => x !== 'ALL');
                      if (!nextHqs.includes(hqName)) nextHqs.push(hqName);
                    }

                    return { ...prev, targetHqs: nextHqs, targetDivisions: nextDivs };
                  }, true);
                  e.target.value = '';
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              >
                <option value="">사업단 또는 본부 선택 추가...</option>
                <option value="ALL">🌐 전체 대상 (모든 사업단 및 본부)</option>
                {divisionSettings && divisionSettings.length > 0 && (
                  <optgroup label="🏢 사업단 (소속 본부 일괄 적용)">
                    {divisionSettings.map((d) => (
                      <option key={d.id} value={`DIV:${d.id}`}>
                        🏢 {d.name} ({d.hqNames?.length || 0}개 본부 소속)
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="🏛️ 개별 본부">
                  {hqSettings.map((h) => (
                    <option key={h.id} value={`HQ:${h.hqName}`}>
                      {h.hqName}
                    </option>
                  ))}
                </optgroup>
              </select>
              <div className="flex flex-wrap gap-1.5 min-h-[36px] p-1.5 bg-slate-50 rounded-xl border border-slate-100">
                {(!draft.targetDivisions || draft.targetDivisions.length === 0) &&
                (draft.targetHqs || ['ALL']).includes('ALL') ? (
                  <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-200/60 flex items-center gap-1">
                    🌐 전체 본부/사업단
                  </span>
                ) : (
                  <>
                    {(draft.targetDivisions || []).map((divId) => {
                      const div = (divisionSettings || []).find((d) => d.id === divId || d.name === divId);
                      const divName = div ? div.name : divId;
                      const hqCount = div?.hqNames?.length ?? 0;
                      return (
                        <span
                          key={divId}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-200 shadow-2xs"
                        >
                          <span className="text-[11px]">🏢</span>
                          <span>{divName} 사업단</span>
                          <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1 py-0.2 rounded font-semibold">
                            {hqCount}개 본부
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              updateDraft((prev) => {
                                const nextDivs = (prev.targetDivisions || []).filter((x) => x !== divId);
                                let nextHqs = prev.targetHqs || [];
                                if (nextDivs.length === 0 && (!nextHqs || nextHqs.length === 0)) {
                                  nextHqs = ['ALL'];
                                }
                                return { ...prev, targetDivisions: nextDivs, targetHqs: nextHqs };
                              }, true);
                            }}
                            className="text-indigo-400 hover:text-rose-600 transition-colors ml-0.5 cursor-pointer"
                            title="사업단 삭제"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      );
                    })}
                    {(draft.targetHqs || []).filter((h) => h !== 'ALL').map((h) => (
                      <span
                        key={h}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-200/60 shadow-2xs"
                      >
                        <span>🏛️ {h}</span>
                        <button
                          type="button"
                          onClick={() => {
                            updateDraft((prev) => {
                              let nextHqs = (prev.targetHqs || []).filter((x) => x !== h);
                              const curDivs = prev.targetDivisions || [];
                              if ((!curDivs || curDivs.length === 0) && nextHqs.length === 0) {
                                nextHqs = ['ALL'];
                              }
                              return { ...prev, targetHqs: nextHqs };
                            }, true);
                          }}
                          className="text-emerald-400 hover:text-rose-600 transition-colors ml-0.5 cursor-pointer"
                          title="본부 삭제"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* 대상 상품 (카테고리) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-600">대상 상품 (카테고리)</label>
              <select
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  updateDraft((prev) => {
                    let nextProds = [...prev.targetProducts];
                    if (val === 'ALL') nextProds = ['ALL'];
                    else {
                      if (nextProds.includes('ALL')) nextProds = [];
                      if (!nextProds.includes(val)) nextProds.push(val);
                    }
                    return { ...prev, targetProducts: nextProds };
                  }, true);
                  e.target.value = '';
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              >
                <option value="">상품 선택 추가...</option>
                <option value="ALL">전체 상품</option>
                {Array.from(new Set(hqSettings.flatMap((h) => h.productRules.map((p: any) => p.productName)))).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-1.5 min-h-[32px] p-1.5 bg-slate-50 rounded-xl border border-slate-100">
                {draft.targetProducts.includes('ALL') ? (
                  <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold border border-blue-200/60">
                    전체 상품
                  </span>
                ) : (
                  draft.targetProducts.map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold border border-blue-200/60"
                    >
                      {p}
                      <button
                        onClick={() => {
                          updateDraft((prev) => {
                            let nextProds = prev.targetProducts.filter((x) => x !== p);
                            if (nextProds.length === 0) nextProds = ['ALL'];
                            return { ...prev, targetProducts: nextProds };
                          }, true);
                        }}
                        className="hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* 대상 제품 (렌탈상품명) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <Package size={13} className="text-purple-600" />
                  <span>대상 제품 (렌탈상품명)</span>
                </label>
                {draft.targetItems && !draft.targetItems.includes('ALL') && draft.targetItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      updateDraft((prev) => ({ ...prev, targetItems: ['ALL'] }), true);
                    }}
                    className="text-[11px] text-purple-600 hover:text-purple-800 hover:underline font-bold cursor-pointer"
                  >
                    전체로 초기화
                  </button>
                )}
              </div>

              {/* 요약 박스 & 상세보기 버튼 */}
              <div
                onClick={onOpenTargetItemsModal}
                className="w-full min-h-[38px] p-1.5 px-2 bg-white hover:bg-purple-50/30 border border-slate-200 hover:border-purple-300 rounded-xl transition-all cursor-pointer shadow-2xs group flex items-center justify-between gap-2"
                title="클릭하여 제품 검색 및 대량 선택 모달 열기"
              >
                <div className="flex items-center gap-1.5 overflow-hidden flex-1">
                  {!draft.targetItems || draft.targetItems.includes('ALL') || draft.targetItems.length === 0 ? (
                    <span className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs font-black border border-purple-200/80 flex items-center gap-1 shrink-0">
                      <Globe size={13} />
                      <span>전체 제품 (ALL)</span>
                    </span>
                  ) : draft.targetItems.length === 1 ? (
                    <span
                      className="px-2.5 py-1 bg-purple-100 text-purple-800 rounded-lg text-xs font-black border border-purple-300 truncate max-w-[200px]"
                      title={draft.targetItems[0]}
                    >
                      {draft.targetItems[0]}
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className="px-2.5 py-1 bg-purple-100 text-purple-800 rounded-lg text-xs font-black border border-purple-300 truncate max-w-[180px]"
                        title={draft.targetItems.join(', ')}
                      >
                        {draft.targetItems[0]} 외 {draft.targetItems.length - 1}개
                      </span>
                      <span className="text-[11px] text-purple-600 font-bold shrink-0">
                        (총 {draft.targetItems.length}개)
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenTargetItemsModal();
                  }}
                  className="px-2.5 py-1 text-[11px] font-black text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-all flex items-center gap-1 shrink-0 group-hover:scale-102 cursor-pointer shadow-2xs"
                >
                  <Search size={12} />
                  <span>상세선택</span>
                </button>
              </div>
            </div>

            {/* 실적 기준일 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-600">실적 인정 기준일</label>
              <select
                value={draft.baseDateType}
                onChange={(e) => {
                  const val = e.target.value as any;
                  updateDraft((prev) => ({ ...prev, baseDateType: val }), true);
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all h-[36px]"
              >
                <option value="DELIVERY">배송완료일자 기준</option>
                <option value="CONTRACT">계약일자 기준</option>
              </select>
            </div>
          </div>
        </div>

        {/* 3. 수수료 금액 & 회차별 차등 산정 */}
        <div className="bg-indigo-50/40 p-4 rounded-2xl border border-indigo-100/80 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-indigo-900 flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.useInstallments || false}
                onChange={(e) => {
                  const checked = e.target.checked;
                  updateDraft((prev) => {
                    let nextIns = prev.installments;
                    if (checked && (!nextIns || nextIns.length === 0)) {
                      nextIns = [{ id: Date.now().toString(), startRound: 1, endRound: 1, amount: 0 }];
                    }
                    return { ...prev, useInstallments: checked, installments: nextIns };
                  }, true);
                }}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-indigo-300"
              />
              회차별 차등 수수료 사용 (체크 시 구간별 회차 금액이 적용됩니다)
            </label>
          </div>

          {draft.useInstallments ? (
            <div className="flex flex-col gap-2 mt-1">
              {(draft.installments || []).map((ins, insIdx) => (
                <div key={ins.id} className="flex gap-2 items-center bg-white p-2 rounded-xl border border-indigo-100">
                  <input
                    type="number"
                    value={ins.startRound}
                    onBlur={handleBlur}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 1;
                      updateDraft((prev) => {
                        const nextIns = [...(prev.installments || [])];
                        nextIns[insIdx] = { ...nextIns[insIdx], startRound: val };
                        return { ...prev, installments: nextIns };
                      });
                    }}
                    className="w-16 px-2.5 py-1 text-xs border border-slate-200 rounded-lg outline-none font-bold text-center"
                    min="1"
                  />
                  <span className="text-xs text-slate-500 font-bold">회차 ~</span>
                  <input
                    type="number"
                    value={ins.endRound}
                    onBlur={handleBlur}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 1;
                      updateDraft((prev) => {
                        const nextIns = [...(prev.installments || [])];
                        nextIns[insIdx] = { ...nextIns[insIdx], endRound: val };
                        return { ...prev, installments: nextIns };
                      });
                    }}
                    className="w-16 px-2.5 py-1 text-xs border border-slate-200 rounded-lg outline-none font-bold text-center"
                    min="1"
                  />
                  <span className="text-xs text-slate-500 font-bold">회차</span>
                  <input
                    type="number"
                    value={ins.amount}
                    onBlur={handleBlur}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 0;
                      updateDraft((prev) => {
                        const nextIns = [...(prev.installments || [])];
                        nextIns[insIdx] = { ...nextIns[insIdx], amount: val };
                        return { ...prev, installments: nextIns };
                      });
                    }}
                    className="w-36 px-3 py-1 text-xs text-right font-black text-indigo-600 border border-slate-200 rounded-lg outline-none ml-auto"
                  />
                  <span className="text-xs font-bold text-slate-500">원</span>
                  <button
                    onClick={() => {
                      updateDraft((prev) => {
                        const nextIns = [...(prev.installments || [])];
                        nextIns.splice(insIdx, 1);
                        return { ...prev, installments: nextIns };
                      }, true);
                    }}
                    className="ml-2 text-slate-300 hover:text-rose-600 cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  updateDraft((prev) => {
                    const currentIns = prev.installments || [];
                    const lastEnd = currentIns.length > 0 ? currentIns[currentIns.length - 1].endRound : 0;
                    const nextIns = [
                      ...currentIns,
                      { id: Date.now().toString(), startRound: lastEnd + 1, endRound: lastEnd + 1, amount: 0 },
                    ];
                    return { ...prev, installments: nextIns };
                  }, true);
                }}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all self-start shadow-xs cursor-pointer"
              >
                + 회차 구간 추가
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
              <div className="bg-white p-3 rounded-xl border border-indigo-100">
                <label className="text-[11px] font-black text-indigo-600 tracking-wide block mb-1">건당 수수료 (원)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={draft.commissionPerUnit}
                    onBlur={handleBlur}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 0;
                      updateDraft((prev) => ({ ...prev, commissionPerUnit: val }));
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-right font-black text-indigo-700 text-sm outline-none focus:ring-2 focus:ring-indigo-200 pr-7"
                  />
                  <span className="absolute right-2.5 top-2 text-xs font-bold text-slate-400">원</span>
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-amber-100">
                <label className="text-[11px] font-black text-amber-600 tracking-wide block mb-1">
                  최소 보장 금액 (원) - 없으면 0
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={draft.minimumGuarantee}
                    onBlur={handleBlur}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 0;
                      updateDraft((prev) => ({ ...prev, minimumGuarantee: val }));
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-right font-black text-amber-600 text-sm outline-none focus:ring-2 focus:ring-amber-200 pr-7"
                  />
                  <span className="absolute right-2.5 top-2 text-xs font-bold text-slate-400">원</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. 세금계산서 발행 및 사업자 구분 */}
        <div className="bg-slate-100/60 p-4 rounded-2xl border border-slate-200/70">
          <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
            🧾 세금계산서 발행 및 정산 유형
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] font-bold text-slate-500 block mb-1">발행 방식</label>
              <select
                value={draft.taxType || 'DEFAULT'}
                onChange={(e) => {
                  const val = e.target.value as any;
                  updateDraft((prev) => ({ ...prev, taxType: val }), true);
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="DEFAULT">기본 본부 세금계산서에 합산</option>
                <option value="CORPORATE">별도 법인/사업자 세금계산서 발행</option>
                <option value="INDIVIDUAL">별도 개인 원천징수 (3.3%)</option>
              </select>
            </div>

            {(draft.taxType === 'CORPORATE' ||
              draft.taxType === 'INDIVIDUAL' ||
              (draft.taxBusinessName && draft.taxBusinessName.trim() !== '')) && (
              <>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    발행 사업자 상호 (생략 시 수급자명)
                  </label>
                  <input
                    type="text"
                    placeholder="예: 주식회사 리치웰페어"
                    value={draft.taxBusinessName || ''}
                    onBlur={handleBlur}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateDraft((prev) => ({ ...prev, taxBusinessName: val }));
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">사업자등록번호</label>
                  <input
                    type="text"
                    placeholder="예: 546-86-01339"
                    value={draft.taxBusinessNo || ''}
                    onBlur={handleBlur}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateDraft((prev) => ({ ...prev, taxBusinessNo: val }));
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
