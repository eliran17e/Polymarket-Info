// Renders toast() messages bottom-center, auto-dismissing. Lives once in Layout.

import { useEffect, useState } from "react";
import { bindToaster } from "../lib/toast";

interface Item {
  id: number;
  message: string;
}

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(
    () =>
      bindToaster((message) => {
        const id = Date.now() + Math.random();
        setItems((prev) => [...prev, { id, message }]);
        setTimeout(() => {
          setItems((prev) => prev.filter((i) => i.id !== id));
        }, 3500);
      }),
    [],
  );

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2">
      {items.map((i) => (
        <div
          key={i.id}
          className="pointer-events-auto max-w-sm rounded-full border border-line-strong bg-ink-900 px-4 py-2 text-sm text-white shadow-sm"
        >
          {i.message}
        </div>
      ))}
    </div>
  );
}
