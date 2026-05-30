export const REPORT_KEY = "kebo-reports";

export const getReports = () => {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(REPORT_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveReports = (reports: any[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(REPORT_KEY, JSON.stringify(reports));
};