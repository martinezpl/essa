import { useEffect, useId, useMemo, useRef, useState } from "react";

type ComboInputOption = string | { value: string; label: string };

type ComboInputProps = {
  value: string;
  options: readonly ComboInputOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

const getOptionValue = (option: ComboInputOption) =>
  typeof option === "string" ? option : option.value;

const getOptionLabel = (option: ComboInputOption) =>
  typeof option === "string" ? option : option.label;

export const ComboInput = ({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  disabled = false,
}: ComboInputProps) => {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const valueLabel =
    options.find((option) => getOptionValue(option) === value) ?? value;
  const [query, setQuery] = useState(getOptionLabel(valueLabel));
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery(getOptionLabel(valueLabel));
    }
  }, [valueLabel, open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q === getOptionLabel(valueLabel).toLowerCase()) {
      return options;
    }
    return options.filter((option) =>
      getOptionLabel(option).toLowerCase().includes(q),
    );
  }, [options, query, valueLabel]);

  useEffect(() => {
    setHighlight((current) =>
      filtered.length === 0 ? 0 : Math.min(current, filtered.length - 1),
    );
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>(
      ".combo-input__option--active",
    );
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [highlight, open]);

  const commit = (next: ComboInputOption) => {
    onChange(getOptionValue(next));
    setQuery(getOptionLabel(next));
    setOpen(false);
  };

  const revert = () => {
    setQuery(getOptionLabel(valueLabel));
    setOpen(false);
  };

  return (
    <div className="combo-input">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(!disabled)}
        onClick={() => setOpen(!disabled)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(!disabled);
        }}
        onBlur={(event) => {
          if (
            listRef.current &&
            event.relatedTarget instanceof Node &&
            listRef.current.contains(event.relatedTarget)
          ) {
            return;
          }
          revert();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHighlight((current) =>
              Math.min(current + 1, Math.max(0, filtered.length - 1)),
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const next = filtered[highlight];
            if (next) {
              commit(next);
            }
          } else if (event.key === "Escape") {
            event.preventDefault();
            revert();
            inputRef.current?.blur();
          } else if (event.key === "Tab") {
            const next = filtered[highlight];
            if (open && next) {
              commit(next);
            }
          }
        }}
      />
      {open && !disabled && filtered.length > 0 ? (
        <div
          id={listId}
          ref={listRef}
          role="listbox"
          className="combo-input__list nowheel"
        >
          {filtered.map((opt, i) => (
            <button
              key={getOptionValue(opt)}
              type="button"
              role="option"
              aria-selected={i === highlight}
              className={`combo-input__option${
                i === highlight ? " combo-input__option--active" : ""
              }${getOptionValue(opt) === value ? " combo-input__option--current" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => {
                commit(opt);
                inputRef.current?.focus();
              }}
            >
              {getOptionLabel(opt)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
