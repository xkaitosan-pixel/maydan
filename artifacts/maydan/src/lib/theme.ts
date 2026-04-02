const KEY = "maydan_theme";

export type Theme = "dark" | "light";

export function getTheme(): Theme {
  return (localStorage.getItem(KEY) as Theme) ?? "dark";
}

export function setTheme(t: Theme) {
  localStorage.setItem(KEY, t);
  applyTheme(t);
}

export function applyTheme(t: Theme) {
  const html = document.documentElement;
  if (t === "light") {
    html.classList.add("light-mode");
    html.classList.remove("dark-mode");
  } else {
    html.classList.remove("light-mode");
    html.classList.add("dark-mode");
  }
}

export function toggleTheme(): Theme {
  const next = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

export function initTheme() {
  applyTheme(getTheme());
}
