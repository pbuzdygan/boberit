import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behavior of a modal dialog: focus moves into the dialog (unless a field there has
 * `autoFocus`), Tab cycles within it, Escape closes it, and focus returns to the element that
 * opened it. Spread the returned props on the dialog element, which also needs `role="dialog"`,
 * `aria-modal="true"`, and a label. The key handler is a React handler, so nested controls (an
 * open select list) handle Escape first and mark it with `preventDefault`.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  // Read during the first render: by the time effects run, `autoFocus` has already moved focus.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.contains(document.activeElement)) dialog.querySelector<HTMLElement>(focusableSelector)?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);

  function onKeyDown(event: KeyboardEvent<T>) {
    if (event.key === 'Escape') {
      if (event.defaultPrevented) return;
      event.preventDefault();
      onClose();
      return;
    }
    const dialog = ref.current;
    if (event.key !== 'Tab' || !dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
      (element) => element.offsetParent !== null,
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { ref, onKeyDown };
}
