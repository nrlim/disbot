"use client";

import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComboboxProps {
    options: { value: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function Combobox({ options, value, onChange, placeholder = "Select...", disabled }: ComboboxProps) {
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

    const selectedOption = options.find((o) => o.value === value);
    const filteredOptions = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()) || o.value.includes(search));

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <button
                type="button"
                className={cn(
                    "flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20",
                    disabled ? "opacity-50 cursor-not-allowed bg-gray-50" : "hover:bg-gray-50"
                )}
                onClick={() => !disabled && setOpen(!open)}
                disabled={disabled}
            >
                <span className={cn("truncate", !selectedOption && "text-gray-500")}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </button>

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
                    <ul className="max-h-60 overflow-auto py-1 text-sm">
                        {filteredOptions.length === 0 ? (
                            <li className="px-4 py-3 text-sm text-gray-500 text-center">No results found.</li>
                        ) : (
                            filteredOptions.map((option) => (
                                <li
                                    key={option.value}
                                    className={cn(
                                        "relative flex cursor-pointer select-none items-center px-4 py-2 hover:bg-gray-100 transition-colors",
                                        value === option.value ? "bg-blue-50/50 text-primary font-medium" : "text-gray-700"
                                    )}
                                    onClick={() => {
                                        onChange(option.value);
                                        setOpen(false);
                                        setSearch("");
                                    }}
                                >
                                    <span className="flex-1 truncate">{option.label}</span>
                                    {value === option.value && (
                                        <Check className="ml-2 h-4 w-4 shrink-0 text-primary" />
                                    )}
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
