let path = $state(window.location.pathname);

window.addEventListener("popstate", () => {
  path = window.location.pathname;
});

export function navigate(to: string): void {
  if (to !== window.location.pathname) {
    window.history.pushState({}, "", to);
  }
  path = to;
}

export const router = {
  get path() {
    return path;
  },
  navigate,
};
