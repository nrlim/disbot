"use client";

import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiSelectProps {
    options: { value: string; label: string }[];
    values: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function MultiSelect({ options, values = [], onChange, placeholder = "Select...", disabled }: MultiSelectProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Close when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleOption = (value: string) => {
        if (values.includes(value)) {
            onChange(values.filter(v => v !== value));
        } else {
            onChange([...values, value]);
        }
    };

    const removeOption = (e: React.MouseEvent, value: string) => {
        e.stopPropagation();
        onChange(values.filter(v => v !== value));
    };

    const filteredOptions = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()) || o.value.includes(search));

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <div
                className={cn(
                    "flex w-full min-h-[42px] items-center justify-between rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-left transition-colors focus-within:ring-2 focus-within:ring-primary/20",
                    disabled ? "opacity-50 cursor-not-allowed bg-gray-50" : "hover:bg-gray-50 cursor-text"
                )}
                onClick={() => !disabled && setOpen(true)}
            >
                <div className="flex flex-wrap gap-1 items-center flex-1 pr-2">
                    {values.length === 0 ? (
                        <span className="text-gray-500 px-1">{placeholder}</span>
                    ) : (
                        values.map(val => {
                            const opt = options.find(o => o.value === val);
                            return (
                                <span key={val} className="flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-md text-xs font-medium">
                                    <span className="max-w-[100px] truncate">{opt ? opt.label : val}</span>
                                    <button
                                        type="button"
                                        onClick={(e) => !disabled && removeOption(e, val)}
                                        className="hover:bg-primary/20 rounded-full p-0.5"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            );
                        })
                    )}
                </div>
                <button
                    type="button"
                    className="p-1 hover:bg-gray-100 rounded-md shrink-0 focus:outline-none"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!disabled) setOpen(!open);
                    }}
                    disabled={disabled}
                >
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </button>
            </div>

            {open && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg ring-1 ring-black ring-opacity-5">
                    <div className="flex items-center border-b px-3">
                        <Search className="mr-2 h-4 w-4 shrink-0 text-gray-400" />
                        <input
                            className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-gray-400"
                            placeholder="Type to search..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <ul className="max-h-40 overflow-y-auto py-1 text-sm custom-scrollbar">
                        {filteredOptions.length === 0 ? (
                            <li className="px-4 py-3 text-sm text-gray-500 text-center">No results found.</li>
                        ) : (
                            filteredOptions.map((option) => {
                                const isSelected = values.includes(option.value);
                                return (
                                    <li
                                        key={option.value}
                                        className={cn(
                                            "relative flex cursor-pointer select-none items-center px-4 py-2 hover:bg-gray-100 transition-colors",
                                            isSelected ? "bg-blue-50/50 text-primary font-medium" : "text-gray-700"
                                        )}
                                        onClick={() => toggleOption(option.value)}
                                    >
                                        <div className="flex-1 truncate flex items-center gap-2">
                                            {option.label}
                                            <span className="text-[10px] text-gray-400 font-mono">({option.value})</span>
                                        </div>
                                        {isSelected && (
                                            <Check className="ml-2 h-4 w-4 shrink-0 text-primary" />
                                        )}
                                    </li>
                                );
                            })
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
