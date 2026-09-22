import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Search,
  CheckSquare,
  Square,
  Package,
  Globe,
  Check,
  RotateCcw,
  Sparkles,
  Layers,
  Filter
} from 'lucide-react';

interface TargetItemsSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  ruleName?: string;
  ruleIndex: number;
  initialSelected?: string[];
  availableProducts: string[];
  onSave: (newSelected: string[]) => void;
}

export function TargetItemsSelectorModal({
  isOpen,
  onClose,
  ruleName,
  ruleIndex,
  initialSelected = ['ALL'],
  availableProducts = [],
  onSave
}: TargetItemsSelectorModalProps) {
  // 전체 제품 적용 여부
  const [isAll, setIsAll] = useState<boolean>(true);
  // 개별 선택된 제품 목록 (Set)
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  // 검색어
  const [searchQuery, setSearchQuery] = useState('');

  // 모달이 열릴 때 초기값 설정
  useEffect(() => {
    if (isOpen) {
      const isAllSelected = !initialSelected || initialSelected.length === 0 || initialSelected.includes('ALL');
      setIsAll(isAllSelected);
      if (isAllSelected) {
        setSelectedSet(new Set());
      } else {
        setSelectedSet(new Set(initialSelected));
      }
      setSearchQuery('');
    }
  }, [isOpen, initialSelected]);

  // 사용 가능한 전체 제품 목록 (중복 제거 및 정렬)
  const sortedProducts = useMemo(() => {
    return Array.from(new Set(availableProducts.filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, 'ko-KR')
    );
  }, [availableProducts]);

  // 검색어로 필터링된 제품 목록
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return sortedProducts;
    const q = searchQuery.trim().toLowerCase().replace(/\s+/g, '');
    return sortedProducts.filter(p =>
      p.toLowerCase().replace(/\s+/g, '').includes(q)
    );
  }, [sortedProducts, searchQuery]);

  // 개별 제품 체크 토글
  const handleToggleProduct = (product: string) => {
    setIsAll(false);
    setSelectedSet(prev => {
      const next = new Set(prev);
      if (next.has(product)) {
        next.delete(product);
      } else {
        next.add(product);
      }
      return next;
    });
  };

  // '전체 제품(ALL)' 모드로 전환
  const handleSetAll = () => {
    setIsAll(true);
    setSelectedSet(new Set());
  };

  // 검색된 제품 일괄 선택
  const handleSelectFiltered = () => {
    setIsAll(false);
    setSelectedSet(prev => {
      const next = new Set(prev);
      filteredProducts.forEach(p => next.add(p));
      return next;
    });
  };

  // 검색된 제품 일괄 해제
  const handleDeselectFiltered = () => {
    setSelectedSet(prev => {
      const next = new Set(prev);
      filteredProducts.forEach(p => next.delete(p));
      return next;
    });
  };

  // 선택된 항목 전체 비우기
  const handleClearAll = () => {
    setIsAll(false);
    setSelectedSet(new Set());
  };

  // 개별 뱃지 제거
  const handleRemoveItem = (product: string) => {
    setSelectedSet(prev => {
      const next = new Set(prev);
      next.delete(product);
      return next;
    });
  };

  // 적용 완료
  const handleApply = () => {
    if (isAll || selectedSet.size === 0) {
      onSave(['ALL']);
    } else {
      onSave(Array.from(selectedSet));
    }
    onClose();
  };

  if (!isOpen) return null;

  const selectedList = Array.from(selectedSet);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-slate-200 bg-linear-to-r from-purple-50 via-slate-50 to-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-600 text-white rounded-xl shadow-md shadow-purple-200">
              <Package size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900">대상 제품(렌탈상품명) 상세 선택</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full border border-purple-300">
                  정책 #{ruleIndex + 1} {ruleName ? `[${ruleName}]` : ''}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                검색 및 다중 체크박스를 통해 대량으로 대상 제품을 선택하고 관리할 수 있습니다.
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

        {/* 상단 툴바: 검색창 및 일괄 액션 버튼 */}
        <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* 검색 입력창 */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="제품명 검색 (예: 퓨리케어, 정수기, 안마의자)..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* 일괄 액션 버튼들 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleSetAll}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                isAll
                  ? 'bg-purple-600 text-white shadow-purple-200'
                  : 'bg-white text-purple-700 border border-purple-200 hover:bg-purple-50'
              }`}
            >
              <Globe size={13} />
              <span>전체 제품 (ALL)</span>
            </button>

            {searchQuery && (
              <button
                onClick={handleSelectFiltered}
                className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="현재 검색된 모든 제품을 선택에 추가합니다."
              >
                <CheckSquare size={13} className="text-purple-600" />
                <span>검색된 {filteredProducts.length}개 전체 선택</span>
              </button>
            )}

            {!isAll && selectedSet.size > 0 && (
              <button
                onClick={handleClearAll}
                className="px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-200 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                title="선택된 모든 제품을 비웁니다."
              >
                <RotateCcw size={12} />
                <span>선택 초기화</span>
              </button>
            )}
          </div>
        </div>

        {/* 본문 2분할 영역: (좌) 가용 제품 체크박스 목록 / (우) 선택된 제품 목록 */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 overflow-hidden">
          {/* 좌측: 제품 선택 리스트 */}
          <div className="flex-1 flex flex-col min-h-0 bg-white">
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500 font-bold shrink-0">
              <div className="flex items-center gap-1.5">
                <span>제품 목록</span>
                <span className="text-[11px] px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded-md">
                  {filteredProducts.length} / {sortedProducts.length}개
                </span>
              </div>
              {searchQuery && (
                <span className="text-[11px] text-purple-600 font-medium">
                  "{searchQuery}" 검색 결과
                </span>
              )}
            </div>

            {/* 전체 제품 모드 안내 배너 */}
            {isAll && (
              <div className="p-3 bg-purple-50 border-b border-purple-100 text-xs text-purple-800 flex items-center gap-2 shrink-0">
                <Globe size={15} className="text-purple-600 shrink-0" />
                <span className="leading-tight">
                  현재 <strong>전체 제품 (ALL)</strong>으로 설정되어 있어 모든 렌탈상품에 적용됩니다.
                  <br />특정 제품만 지정하려면 아래 목록에서 체크해 주세요.
                </span>
              </div>
            )}

            {/* 체크박스 스크롤 영역 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {filteredProducts.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <Package size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-bold">일치하는 제품이 없습니다.</p>
                  <p className="text-[11px] mt-0.5">다른 검색어를 입력해 보세요.</p>
                </div>
              ) : (
                filteredProducts.map(prod => {
                  const isChecked = !isAll && selectedSet.has(prod);
                  return (
                    <div
                      key={prod}
                      onClick={() => handleToggleProduct(prod)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-purple-50/80 text-purple-900 font-bold border border-purple-200'
                          : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                      }`}
                    >
                      <div className="shrink-0 text-purple-600">
                        {isChecked ? (
                          <CheckSquare size={16} className="text-purple-600" />
                        ) : (
                          <Square size={16} className="text-slate-300" />
                        )}
                      </div>
                      <span className="truncate flex-1" title={prod}>
                        {prod}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 우측: 현재 선택된 제품 요약 패널 */}
          <div className="w-full md:w-80 flex flex-col min-h-0 bg-slate-50/60 shrink-0">
            <div className="px-5 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700 shrink-0">
              <div className="flex items-center gap-1.5">
                <Layers size={13} className="text-purple-600" />
                <span>선택된 제품</span>
              </div>
              <span className="text-[11px] px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full font-black">
                {isAll ? '전체 (ALL)' : `${selectedList.length}개`}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {isAll ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400">
                  <Globe size={36} className="text-purple-400 mb-2 opacity-80" />
                  <p className="text-xs font-bold text-slate-600">전체 제품이 선택되어 있습니다</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    어떤 제품이든 제한 없이 본 수당 규칙이 적용됩니다.
                  </p>
                </div>
              ) : selectedList.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400">
                  <CheckSquare size={32} className="mb-2 opacity-40" />
                  <p className="text-xs font-bold">선택된 제품이 없습니다</p>
                  <p className="text-[11px] mt-0.5">
                    왼쪽 목록에서 적용할 제품을 체크해 주세요.
                    <br />(미선택 시 자동으로 전체 제품으로 처리됩니다)
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-[11px] text-slate-500 font-bold mb-2 flex items-center justify-between">
                    <span>선택 목록 ({selectedList.length}개)</span>
                    <button
                      onClick={handleClearAll}
                      className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                    >
                      모두 제거
                    </button>
                  </div>
                  {selectedList.map(prod => (
                    <div
                      key={prod}
                      className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 bg-white border border-purple-200 rounded-xl text-xs font-bold text-purple-900 shadow-2xs group"
                    >
                      <span className="truncate flex-1" title={prod}>
                        {prod}
                      </span>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleRemoveItem(prod);
                        }}
                        className="p-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all cursor-pointer shrink-0"
                        title="제거"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">적용 상태:</span>
            {isAll || selectedList.length === 0 ? (
              <span className="px-2.5 py-1 bg-purple-100 text-purple-800 rounded-lg font-black border border-purple-300">
                전체 제품 (ALL) 적용
              </span>
            ) : (
              <span className="px-2.5 py-1 bg-purple-100 text-purple-800 rounded-lg font-black border border-purple-300">
                {selectedList[0]}
                {selectedList.length > 1 && ` 외 ${selectedList.length - 1}개`}
                <span className="ml-1 text-[11px] font-normal text-purple-600">
                  (총 {selectedList.length}개)
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              취소
            </button>
            <button
              onClick={handleApply}
              className="px-5 py-2 text-xs font-black bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-md shadow-purple-200 hover:scale-102 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check size={14} />
              <span>적용하기</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
