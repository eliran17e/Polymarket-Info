// Minimal toast bus: any component calls toast("..."), the <Toaster/> in Layout
// renders it. No context/provider ceremony needed at this app size.

type Listener = (message: string) => void;

let listener: Listener | null = null;

export function toast(message: string): void {
  listener?.(message);
}

export function bindToaster(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}
