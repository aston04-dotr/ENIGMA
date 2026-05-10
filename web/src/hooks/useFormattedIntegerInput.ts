import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type ChangeEvent,
  type Dispatch,
  type InputHTMLAttributes,
  type RefObject,
  type SetStateAction,
} from "react";

export function extractIntegerDigitsBounded(raw: string, maxDigits = 18): string {
  return raw.replace(/\D/g, "").slice(0, maxDigits);
}

export function formatIntegerThousandsRu(digits: string): string {
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function digitsLeftOfCaret(display: string, caret: number): number {
  return display.slice(0, Math.max(0, caret)).replace(/\D/g, "").length;
}

/** Курсор сразу после `digitCount`-й цифры слева (digitCount может быть 0). */
export function caretAfterDigitCount(display: string, digitCount: number): number {
  if (digitCount <= 0) return 0;
  let counted = 0;
  for (let i = 0; i < display.length; i++) {
    const ch = display[i];
    if (ch !== undefined && /\d/.test(ch)) {
      counted += 1;
      if (counted >= digitCount) return i + 1;
    }
  }
  return display.length;
}

/**
 * Controlled: храните только строку цифр; показывает значение с пробелами по тысячам.
 * Курсор сохраняется через useLayoutEffect после setState.
 */
export function useFormattedIntegerInput(
  digits: string,
  setDigits: Dispatch<SetStateAction<string>>,
  options?: { maxDigits?: number },
): {
  formattedProps: Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "inputMode"
  > & {
    ref: RefObject<HTMLInputElement | null>;
    value: string;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    inputMode: "numeric";
  };
} {
  const maxDigits = options?.maxDigits ?? 18;
  const ref = useRef<HTMLInputElement>(null);
  const caretAfterChange = useRef<number | null>(null);

  const display = useMemo(() => formatIntegerThousandsRu(digits), [digits]);

  useLayoutEffect(() => {
    if (caretAfterChange.current === null || ref.current === null) return;
    const n = caretAfterChange.current;
    caretAfterChange.current = null;
    const pos = caretAfterDigitCount(display, n);
    ref.current.setSelectionRange(pos, pos);
  }, [display]);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const el = e.target;
      const caret = el.selectionStart ?? 0;
      const left = digitsLeftOfCaret(el.value, caret);
      const next = extractIntegerDigitsBounded(el.value, maxDigits);
      caretAfterChange.current = Math.min(left, next.length);
      setDigits(next);
    },
    [maxDigits, setDigits],
  );

  return {
    formattedProps: {
      ref,
      value: display,
      onChange,
      inputMode: "numeric",
    },
  };
}
