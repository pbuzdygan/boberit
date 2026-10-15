import { useEffect, useId, useRef, useState } from 'react';

type FormSelectOption = { value: string; label: string };

export function FormSelect({
  className = '',
  disabled = false,
  hideLabel = false,
  label,
  value,
  options,
  onChange,
}: {
  className?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  label: string;
  value: string;
  options: FormSelectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.document.addEventListener('mousedown', close);
    return () => window.document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  function showOptions() {
    if (disabled || options.length === 0) return;
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (bounds) {
      const menuHeight = Math.min(210, options.length * 30 + 8);
      const spaceBelow = window.innerHeight - bounds.bottom;
      setOpenUp(spaceBelow < menuHeight + 4 && bounds.top > spaceBelow);
    }
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      if (!open) return;
      // Marks the key as handled, so an enclosing dialog stays open while only the list closes.
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'Tab') setOpen(false);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        showOptions();
        return;
      }
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      if (options.length > 0) setActiveIndex((current) => (current + direction + options.length) % options.length);
    }
  }

  const triggerLabel = hideLabel
    ? { 'aria-label': label }
    : { 'aria-labelledby': `${listboxId}-label ${listboxId}-trigger` };
  return (
    <div
      className={`form-select-field${hideLabel ? ' is-label-hidden' : ''}${openUp ? ' opens-up' : ''}${className ? ` ${className}` : ''}`}
    >
      {!hideLabel && (
        <span className="form-select-label" id={`${listboxId}-label`}>
          {label}
        </span>
      )}
      <div className="form-select" ref={rootRef}>
        <button
          {...triggerLabel}
          aria-controls={listboxId}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="form-select-trigger"
          disabled={disabled}
          id={`${listboxId}-trigger`}
          onClick={() => (open ? setOpen(false) : showOptions())}
          onKeyDown={handleKeyDown}
          ref={triggerRef}
          type="button"
        >
          <span>{selected?.label ?? ''}</span>
          <span aria-hidden="true" className="form-select-chevron" />
        </button>
        {open && (
          <div
            {...(hideLabel ? { 'aria-label': label } : { 'aria-labelledby': `${listboxId}-label` })}
            className="form-select-options"
            id={listboxId}
            role="listbox"
          >
            {options.map((option, index) => (
              <button
                aria-selected={option.value === value}
                className={option.value === value ? 'is-selected' : ''}
                key={option.value}
                onClick={() => choose(index)}
                onKeyDown={handleKeyDown}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="option"
                tabIndex={index === activeIndex ? 0 : -1}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
