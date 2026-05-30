```ts
export const REPORT_KEY = "kebo-reports";

export const getReports = () => {
  if (typeof window === "undefined")
    return [];

  try {
    const data =
      localStorage.getItem(REPORT_KEY);

    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveReports = (
  reports: any[]
) => {
  localStorage.setItem(
    REPORT_KEY,
    JSON.stringify(reports)
  );
};

export const getReportByDate = (
  date: string
) => {
  const reports = getReports();

  return reports.find(
    (r: any) => r.date === date
  );
};

export const saveReport = (
  report: any
) => {
  const reports = getReports();

  const existingIndex =
    reports.findIndex(
      (r: any) =>
        r.date === report.date
    );

  if (existingIndex >= 0) {
    reports[existingIndex] = report;
  } else {
    reports.push(report);
  }

  saveReports(reports);
};

export const getLastReportDate =
  () => {
    const reports = getReports();

    if (!reports.length) return null;

    return reports.sort(
      (a: any, b: any) =>
        new Date(b.date).getTime() -
        new Date(a.date).getTime()
    )[0].date;
  };
```
