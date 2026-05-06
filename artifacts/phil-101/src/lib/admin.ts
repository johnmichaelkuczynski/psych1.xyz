export function useAdminOverride() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("admin") === "true";
}
