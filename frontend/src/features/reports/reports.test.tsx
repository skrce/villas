import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildApis } from "../../api/client";
import { buildBookingActions } from "../../api/bookingActions";
import { Configuration, ReportsApi } from "../../api/generated";
import { getSessionEpoch } from "../../api/session";
import * as session from "../../api/session";
import { WorkspaceContext } from "../../app/context";
import {
  balance,
  chargedReport,
  reportFixture,
  todayFixture,
} from "../../test/reporting";
import { Today } from "./Today";
import { Reports } from "./Reports";
import { Download } from "./Download";
import { reportSchema } from "./data";
const api = vi.fn<typeof fetch>();
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let cache: QueryClient;
let response = chargedReport();
function mount(
  view: "today" | "reports" | "download" = "reports",
  path = "/reports?kind=CHARGES&from=2026-11-07&to=2026-11-10",
) {
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const epoch = getSessionEpoch(),
    apis = buildApis("synthetic", epoch);
  vi.spyOn(apis.apartmentApi, "apartmentDirectory").mockResolvedValue({
    items: [
      { id: 7, name: "Synthetic lake room", reference: "SYN-7", active: true },
    ],
    nextCursor: undefined,
  });
  const reportsApi = new ReportsApi(
    new Configuration({ basePath: "/api/v1", fetchApi: api }),
  );
  return render(
    <QueryClientProvider client={cache}>
      <WorkspaceContext.Provider
        value={{
          apis: {
            ...apis,
            reportsApi,
            apartmentApi: apis.apartmentApi,
          },
          ownerId: "synthetic",
          epoch,
          booking: buildBookingActions(apis.reservationApi, "report-tests"),
        }}
      >
        <MemoryRouter initialEntries={[path]}>
          {view === "today" ? (
            <Today />
          ) : view === "download" ? (
            <Download report={reportSchema.parse(response)} enabled />
          ) : (
            <Reports />
          )}
        </MemoryRouter>
      </WorkspaceContext.Provider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  response = chargedReport();
  api.mockReset();
  api.mockImplementation(async (input) =>
    String(input).includes("/today") ? json(todayFixture()) : json(response),
  );
  URL.createObjectURL = vi.fn(() => "blob:report");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  cache?.clear();
  vi.restoreAllMocks();
});
it("shows Today counts, bounded examples and links to operational records", async () => {
  mount("today");
  expect(await screen.findByText("Showing 1 of 7 stays.")).toBeInTheDocument();
  const arrivals = within(screen.getByRole("region", { name: "Arrivals" }));
  expect(
    arrivals.getByRole("link", { name: "Synthetic Гост · #11" }),
  ).toHaveAttribute("href", "/reservations/11");
  expect(
    screen.getByRole("link", { name: "Review today's collections" }),
  ).toHaveAttribute(
    "href",
    "/reports?kind=COLLECTIONS&from=2026-11-07&to=2026-11-08",
  );
  expect(
    screen.getByText(/1 active room needs nightly rates/),
  ).toBeInTheDocument();
});
it("shows explicit unknown prices alongside known balance subtotals", async () => {
  api.mockResolvedValueOnce(
    json({
      ...todayFixture(),
      balances: { ...todayFixture().balances, unknownCount: 1 },
    }),
  );
  mount("today");
  expect(
    await screen.findByText(
      /complete outstanding and credit totals are unknown/,
    ),
  ).toBeInTheDocument();
});
it("does not render a failed initial Today read as zero activity", async () => {
  api.mockResolvedValueOnce(json({ code: "NOPE" }, 500));
  mount("today");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be loaded",
  );
  expect(screen.queryByText("Arrivals today")).not.toBeInTheDocument();
});
it("renders reconciled charges and source links", async () => {
  mount();
  expect(
    await screen.findByRole("heading", { name: "Booked charges" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Synthetic Гост · #11" }),
  ).toHaveAttribute("href", "/reservations/11");
  expect(
    screen.getByRole("button", { name: "Download complete CSV" }),
  ).toBeEnabled();
  expect(screen.getAllByText("€150.03").length).toBeGreaterThan(1);
});
it("keeps unpriced source rows visible and the complete charge total unknown", async () => {
  response.charges[0].chargeCents = null;
  response.totals.chargeCents = null;
  response.totals.knownChargeCents = 0;
  response.totals.unknownPriceCount = 1;
  response.notices = ["UNKNOWN_PRICES"];
  mount();
  expect(
    await screen.findByText(/complete amount is unknown/),
  ).toBeInTheDocument();
  expect(screen.getAllByText("Unknown")).toHaveLength(2);
});
it("does not request an invalid deep-linked period", async () => {
  mount("reports", "/reports?kind=CHARGES&from=2026-02-30&to=2026-03-01");
  expect(screen.getByRole("alert")).toHaveTextContent("filters are invalid");
  expect(api).not.toHaveBeenCalled();
});
it("refuses a mismatched filter response rather than labeling it as the requested report", async () => {
  response.startDate = "2026-11-08";
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be loaded or verified",
  );
  expect(screen.queryByText("Complete booked charges")).not.toBeInTheDocument();
});
it("marks a failed refresh stale and disables downloads", async () => {
  mount();
  await screen.findByText("Complete booked charges");
  api.mockResolvedValueOnce(json({}, 500));
  await userEvent.click(screen.getByRole("button", { name: "Refresh report" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "previously loaded data",
  );
  expect(
    screen.getByRole("button", { name: "Download complete CSV" }),
  ).toBeDisabled();
});
it("shows record-limit failures without a partial report", async () => {
  api.mockResolvedValueOnce(json({ code: "REPORT_TOO_LARGE" }, 409));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No partial report was returned",
  );
  expect(screen.queryByText("Source records")).not.toBeInTheDocument();
});
it("shows full-booking balances and their payment drill-down", async () => {
  response = reportFixture("BALANCES");
  response.balances = [balance()];
  response.totals.knownOutstandingCents = 14003;
  response.totals.outstandingCents = 14003;
  response.totals.creditCents = 0;
  mount("reports", "/reports?kind=BALANCES&from=2026-11-07&to=2026-11-10");
  expect(
    await screen.findByRole("link", { name: "Synthetic Гост · #11" }),
  ).toHaveAttribute("href", "/reservations/11#payments");
});
it("downloads a bounded CSV with the reviewed snapshot and explicit success", async () => {
  api.mockResolvedValueOnce(
    new Response('\uFEFF"record_type"\r\n"METADATA"', {
      headers: { "Content-Type": "text/csv;charset=UTF-8" },
    }),
  );
  mount("download");
  await userEvent.click(
    screen.getByRole("button", { name: "Download complete CSV" }),
  );
  expect(await screen.findByText(/CSV downloaded/)).toBeInTheDocument();
  expect(String(api.mock.calls[0][0])).toContain(
    `snapshotId=${"a".repeat(64)}`,
  );
  expect(URL.createObjectURL).toHaveBeenCalledOnce();
});
it("requires a fresh report after the export source changed", async () => {
  api.mockResolvedValueOnce(json({ code: "REPORT_CHANGED" }, 409));
  mount("download");
  await userEvent.click(
    screen.getByRole("button", { name: "Download complete CSV" }),
  );
  expect(
    await screen.findByText(/Refresh the report before downloading/),
  ).toBeInTheDocument();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it("never saves an in-flight download after the report unmounts", async () => {
  let resolve!: (value: Response) => void;
  api.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = mount("download");
  await userEvent.click(
    screen.getByRole("button", { name: "Download complete CSV" }),
  );
  view.unmount();
  await act(async () => {
    resolve(new Response("csv", { headers: { "Content-Type": "text/csv" } }));
  });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it("rejects an unexpected export type with visible failure", async () => {
  api.mockResolvedValueOnce(json({ foo: "bar" }));
  mount("download");
  await userEvent.click(
    screen.getByRole("button", { name: "Download complete CSV" }),
  );
  await waitFor(() =>
    expect(screen.getByText(/CSV could not be downloaded/)).toBeInTheDocument(),
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("applies an explicit room filter before requesting and relabeling the report", async () => {
  mount();
  await screen.findByText("Complete booked charges");
  await userEvent.selectOptions(
    screen.getByLabelText("Room", { exact: true }),
    "7",
  );
  expect(api.mock.calls).toHaveLength(1);
  response.roomId = 7;
  response.snapshotId = "b".repeat(64);
  await userEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  await waitFor(() =>
    expect(String(api.mock.calls.at(-1)?.[0])).toContain("roomId=7"),
  );
  expect(await screen.findByText(/Room #7 · EUR/)).toBeInTheDocument();
});

it("reveals further source rows without changing the complete total", async () => {
  const row = response.charges[0];
  response.charges = Array.from({ length: 26 }, (_, i) => ({
    ...row,
    reservationId: 11 + i,
  }));
  response.totals.chargeCents = 15003 * 26;
  response.totals.knownChargeCents = 15003 * 26;
  mount();
  expect(
    await screen.findByText("Showing 25 of 26. CSV includes every source row."),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Synthetic Гост · #36" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Show more source rows" }),
  );
  expect(
    screen.getByRole("link", { name: "Synthetic Гост · #36" }),
  ).toBeInTheDocument();
  expect(screen.getAllByText("€3,900.78")).toHaveLength(2);
});

it("discards an in-flight CSV if the session generation changes", async () => {
  let resolve!: (value: Response) => void;
  api.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mount("download");
  await userEvent.click(
    screen.getByRole("button", { name: "Download complete CSV" }),
  );
  vi.spyOn(session, "getSessionEpoch").mockReturnValue(getSessionEpoch() + 1);
  await act(async () => {
    resolve(new Response("csv", { headers: { "Content-Type": "text/csv" } }));
  });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("rejects an oversized CSV response before creating a browser download", async () => {
  api.mockResolvedValueOnce(
    new Response("x".repeat(5 * 1024 * 1024 + 1), {
      headers: { "Content-Type": "text/csv" },
    }),
  );
  mount("download");
  await userEvent.click(
    screen.getByRole("button", { name: "Download complete CSV" }),
  );
  expect(
    await screen.findByText(/CSV could not be downloaded/),
  ).toBeInTheDocument();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
