import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildBookingActions } from "./bookingActions";
import { Configuration, OperationsApi, ReservationApi } from "./generated";

const actor="00000000-0000-0000-0000-000000000001";
const api=vi.fn<typeof fetch>();
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json"}});
const client=()=>buildBookingActions(new ReservationApi(new Configuration({basePath:"/api/v1"})),"readiness-test","login",undefined,undefined,undefined,
  {operations:new OperationsApi(new Configuration({basePath:"/api/v1"})),actorId:actor});
const key=()=>new Headers(api.mock.calls[0][1]?.headers).get("Idempotency-Key")!;
const result=(stable:string)=>({key:stable,kind:"SET_READINESS",resourceId:7,
  readiness:{roomId:7,state:"IN_PROGRESS",version:1,changedAt:"2026-11-07T01:00:00.123456Z"},
  readinessEvent:{id:"9007199254741001",actorId:actor,operationKey:stable,version:1,previousState:"DIRTY",state:"IN_PROGRESS",reason:"Synthetic cleaning",
    reservationId:null,occurredAt:"2026-11-07T01:00:00.123456Z"}});
beforeEach(()=>{localStorage.clear();sessionStorage.clear();api.mockReset();vi.stubGlobal("fetch",api);});
afterEach(()=>vi.unstubAllGlobals());
it("reconciles a lost readiness response at its original version after room archival without a second POST",async()=>{
  api.mockRejectedValueOnce(new TypeError("Connection lost"));
  await expect(client().changeReadiness(7,"IN_PROGRESS","Synthetic cleaning",0)).rejects.toThrow();
  const stable=key();expect(JSON.stringify(localStorage)).not.toContain("Synthetic cleaning");
  api.mockResolvedValueOnce(json(result(stable)));
  await expect(client().changeReadiness(7,"IN_PROGRESS","Synthetic cleaning",12,true)).resolves.toMatchObject({version:1,state:"IN_PROGRESS"});
  expect(api.mock.calls.filter(([,init])=>init?.method==="POST")).toHaveLength(1);
  expect(localStorage.getItem("villarosa.pendingOperations.v2")).toBe("{}");
});
it.each([
  {actorId:"00000000-0000-0000-0000-000000000002"},{reason:"Different"},{version:2},{state:"CLEAN"},
  {id:9007199254741000},{reservationId:42},{occurredAt:"2026-11-07T01:00:01Z"},
])("retains the original intent when audit proof is inconsistent %j",async patch=>{
  api.mockResolvedValueOnce(json({})).mockImplementationOnce(async()=>{const saved=result(key());return json({...saved,readinessEvent:{...saved.readinessEvent,...patch}});});
  await expect(client().changeReadiness(7,"IN_PROGRESS","Synthetic cleaning",0)).rejects.toThrow();
  expect(localStorage.getItem("villarosa.pendingOperations.v2")).toContain(key());
});
it("keeps read-only recovery pending without inventing a new operation",async()=>{
  await expect(client().changeReadiness(7,"IN_PROGRESS","Synthetic cleaning",0,true)).rejects.toThrow("No previous readiness save");
  expect(api).not.toHaveBeenCalled();
});
