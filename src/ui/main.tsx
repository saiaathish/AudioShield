import { createRoot } from "react-dom/client";

export function mountUi(root: HTMLElement): void { createRoot(root).render(null); }
