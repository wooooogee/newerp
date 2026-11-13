import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selectedOptions: string[];
  onChange: (selected: string[]) => void;
  className?: string;
  displayClassName?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
}

export const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({ 
  label,
  options,
  selectedOptions,
  onChange,
  className,
  displayClassName,
  searchable = true,
  searchPlaceholder,
  emptyMessage
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    } else if (searchable && options.length > 0) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 20);
    }
  }, [isOpen, searchable, options.length]);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter(opt => opt.toLowerCase().includes(q));
  }, [options, searchQuery]);

  const handleToggle = (option: string) => {
    if (selectedOptions.includes(option)) {
      onChange(selectedOptions.filter(o => o !== option));
    } else {
      onChange([...selectedOptions, option]);
    }
  };

  const isAllSelected = selectedOptions.length === 0;

  const handleToggleAll = () => {
    onChange([]); // Setting to empty array means '전체'
  };

  const displayValue = isAllSelected 
    ? '전체' 
    : selectedOptions.length === 1 
      ? selectedOptions[0] 
      : `${selectedOptions[0]} 외 ${selectedOptions.length - 1}건`;

  return (
    <div 
      className={className || "relative flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors"} 
      ref={dropdownRef} 
      onClick={() => setIsOpen(!isOpen)}
    >
      <span className="text-[11px] font-bold text-slate-400 shrink-0">{label}</span>
      <div className={displayClassName || "flex items-center justify-between flex-1 min-w-0"}>
        <span className="text-[12px] font-bold text-slate-700 truncate">{displayValue}</span>
        <ChevronDown size={14} className={`text-slate-400 ml-1 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1.5 min-w-[260px] w-max max-w-[420px] bg-white border border-slate-200 shadow-2xl rounded-xl z-50 max-h-[480px] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {options.length === 0 && emptyMessage ? (
            <div className="px-4 py-6 text-center text-[12.5px] font-bold text-slate-400 whitespace-nowrap">
              {emptyMessage}
            </div>
          ) : (
            <>
              {searchable && (
                <div className="p-2 border-b border-slate-100 bg-slate-50/70 shrink-0">
                  <div className="relative flex items-center">
                    <Search size={13} className="absolute left-2.5 text-slate-400 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder={searchPlaceholder || `${label} 검색...`}
                      className="w-full pl-8 pr-7 py-1.5 text-[12px] font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 placeholder:text-slate-400"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="overflow-y-auto max-h-[410px] py-1">
                {!searchQuery.trim() && (
                  <div 
                    className="flex items-center px-3.5 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-100"
                    onClick={handleToggleAll}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2.5 shrink-0 ${isAllSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                      {isAllSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                    </div>
                    <span className={`text-[13px] whitespace-nowrap ${isAllSelected ? 'font-black text-blue-700' : 'font-bold text-slate-700'}`}>전체</span>
                  </div>
                )}

                {filteredOptions.length > 0 ? (
                  filteredOptions.map(option => {
                    const isSelected = selectedOptions.includes(option);
                    return (
                      <div 
                        key={option}
                        className="flex items-center px-3.5 py-2.5 hover:bg-slate-50 cursor-pointer"
                        onClick={() => handleToggle(option)}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2.5 shrink-0 ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                          {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                        </div>
                        <span className={`text-[13px] whitespace-nowrap pr-2 ${isSelected ? 'font-bold text-blue-700' : 'font-medium text-slate-700'}`}>{option}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-4 py-5 text-center text-[12px] text-slate-400 font-medium">
                    검색 결과가 없습니다.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
