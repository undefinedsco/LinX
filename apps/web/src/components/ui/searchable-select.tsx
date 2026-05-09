import * as React from "react"
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "./input"

export interface SearchableSelectProps<T> {
  // --- Data ---
  value?: T | null
  onChange: (value: T | null) => void
  
  // --- Data Source (Pick one) ---
  /** Local options (static) */
  options?: T[]
  /** Remote search function */
  onSearch?: (query: string) => Promise<T[]>
  
  // --- Creation ---
  allowCreate?: boolean
  onCreate?: (inputValue: string) => void
  
  // --- Rendering ---
  /** Function to get the display label from an item */
  getLabel: (item: T) => string
  /** Function to get the unique ID from an item */
  getValue: (item: T) => string
  /** Custom item renderer */
  renderOption?: (item: T, isSelected: boolean) => React.ReactNode
  
  // --- UI ---
  placeholder?: string
  loading?: boolean
  className?: string
  disabled?: boolean
  /** Whether to clear the input after selection (for action-like behavior) */
  clearOnSelect?: boolean
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value)
  React.useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

export function SearchableSelect<T>({
  value,
  onChange,
  options = [],
  onSearch,
  allowCreate = false,
  onCreate,
  getLabel,
  getValue,
  renderOption,
  placeholder = "Select...",
  loading: externalLoading,
  className,
  disabled,
  clearOnSelect = false,
}: SearchableSelectProps<T>) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const [internalOptions, setInternalOptions] = React.useState<T[]>(options)
  const [internalLoading, setInternalLoading] = React.useState(false)
  const [focusedIndex, setFocusedIndex] = React.useState(-1)
  
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)

  const debouncedSearch = useDebounce(inputValue, 300)
  const isLoading = externalLoading || internalLoading

  // console.log('SearchableSelect Render:', { optionsCount: options?.length, inputValue, isLoading })

  // Initial options setup
  React.useEffect(() => {
    if (!onSearch) {
      // Local mode: Filter options based on input
      if (!inputValue) {
        setInternalOptions(options)
      } else {
        const lower = inputValue.toLowerCase()
        setInternalOptions(options.filter(opt => 
          getLabel(opt).toLowerCase().includes(lower)
        ))
      }
    }
  }, [options, inputValue, onSearch, getLabel])

  // Remote search effect
  React.useEffect(() => {
    if (onSearch && open) {
      // If we have a value and just opened, we might not want to search immediately unless user types?
      // Actually usually we want to show default options or search for empty string
      setInternalLoading(true)
      onSearch(debouncedSearch)
        .then(setInternalOptions)
        .catch(console.error)
        .finally(() => setInternalLoading(false))
    }
  }, [debouncedSearch, onSearch, open])

  // Click outside to close
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setFocusedIndex(-1)
        // Reset input if we didn't select anything and we aren't in clearOnSelect mode
        // Actually, UX: if user typed but clicked away, should we keep input? 
        // For a select, usually we revert to the selected value's label.
        if (value && !clearOnSelect) {
           setInputValue(getLabel(value))
        } else if (!clearOnSelect) {
           setInputValue("")
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [value, getLabel, clearOnSelect])

  // Update input when value changes externally
  React.useEffect(() => {
    if (value && !clearOnSelect) {
      setInputValue(getLabel(value))
    } else if (!open) {
      // Only clear input if closed, to avoid clearing while typing
      setInputValue("")
    }
  }, [value, getLabel, clearOnSelect, open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setFocusedIndex(prev => (prev < internalOptions.length + (allowCreate && inputValue ? 1 : 0) - 1 ? prev + 1 : prev))
        break
      case "ArrowUp":
        e.preventDefault()
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : 0))
        break
      case "Enter":
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < internalOptions.length) {
          handleSelect(internalOptions[focusedIndex])
        } else if (allowCreate && inputValue && focusedIndex === internalOptions.length) {
          handleCreate()
        } else if (internalOptions.length === 1) {
           // Auto-select single match? Maybe. Let's stick to explicit focus for now.
           handleSelect(internalOptions[0])
        }
        break
      case "Escape":
        setOpen(false)
        inputRef.current?.blur()
        break
    }
  }

  const handleSelect = (item: T) => {
    onChange(item)
    setOpen(false)
    setFocusedIndex(-1)
    if (clearOnSelect) {
      setInputValue("")
    } else {
      setInputValue(getLabel(item))
    }
  }

  const handleCreate = () => {
    if (onCreate && inputValue) {
      onCreate(inputValue)
      setOpen(false)
      setFocusedIndex(-1)
      if (clearOnSelect) setInputValue("")
    }
  }

  // Auto-scroll to focused item
  React.useEffect(() => {
    if (open && listRef.current && focusedIndex >= 0) {
      const item = listRef.current.children[focusedIndex] as HTMLElement
      if (item) {
        item.scrollIntoView({ block: "nearest" })
      }
    }
  }, [focusedIndex, open])

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setOpen(true)
            setFocusedIndex(0) // Reset focus on type
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-10"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" role="status" aria-label="Loading" />
          ) : (
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          )}
        </div>
      </div>

      {open && (
        <div className="absolute top-full z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
          <ul
            ref={listRef}
            className="max-h-[300px] overflow-auto p-1"
          >
            {internalOptions.length === 0 && !isLoading && !allowCreate && (
              <li className="px-2 py-4 text-center text-sm text-muted-foreground">
                No results found.
              </li>
            )}
            
            {internalOptions.map((item, index) => {
              const isSelected = value ? getValue(value) === getValue(item) : false
              const isFocused = index === focusedIndex
              
              return (
                <li
                  key={getValue(item)}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                    isFocused ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground",
                    isSelected && "font-medium"
                  )}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setFocusedIndex(index)}
                >
                  <div className="flex flex-1 items-center gap-2">
                    {renderOption ? renderOption(item, isSelected) : getLabel(item)}
                  </div>
                  {isSelected && <Check className="ml-auto h-4 w-4 opacity-50" />}
                </li>
              )
            })}

            {allowCreate && inputValue && !internalOptions.some(opt => getLabel(opt).trim().toLowerCase() === inputValue.trim().toLowerCase()) && (
              <li
                className={cn(
                  "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors border-t mt-1",
                  focusedIndex === internalOptions.length ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
                )}
                onClick={handleCreate}
                onMouseEnter={() => setFocusedIndex(internalOptions.length)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create "{inputValue}"
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
