// Controlled local implementation variants; requirements and plan stay unchanged.
export type BuildVariant = "correct" | "wrong-seller" | "lost-region";
export function builtPage(path: string, variant: BuildVariant) {
  const content =
    path === "/store"
      ? '<h1>Maple Market</h1><a href="/product">Notebook</a>'
      : path === "/product"
        ? `<h1>Notebook</h1><p>Sold by ${variant === "wrong-seller" ? "Pine Depot" : "Maple Market"}</p><p>In stock</p>`
        : `<h1>Choose your region</h1><button type="button" onclick="localStorage.setItem('region','Ontario');document.getElementById('region').textContent='Sending to Ontario'">Ontario</button><a href="/store">Maple Market</a>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Fictional shop</title><style>body{font:20px system-ui;max-width:800px;margin:24px}button,a{display:block;padding:12px}</style><body><p>FICTIONAL LOCAL TEST</p><p id="region"></p>${content}<script>${variant === "lost-region" && path === "/store" ? "localStorage.removeItem('region');" : ""}document.getElementById('region').textContent='Sending to '+(localStorage.getItem('region')||'no region');</script></body></html>`;
}
