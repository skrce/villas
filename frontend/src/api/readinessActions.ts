import { GetOperationKindEnum, type OperationsApi } from "./generated";
import type { OperationRunner } from "./bookingActions";
import { readinessSchema, readinessEventSchema, type ReadinessState } from "../shared/operations";

export const buildReadinessActions = (run: OperationRunner, api?: OperationsApi, actorId?: string) => ({
  changeReadiness: (roomId: number, state: ReadinessState, reason: string, expectedVersion: number, recoveryOnly=false) => {
    const explanation = reason.trim() || undefined;
    return run(GetOperationKindEnum.SetReadiness,["readiness-v1",roomId,state,explanation??null],async()=>expectedVersion,
      intent=>{
        if(!api) throw new Error("Room readiness is unavailable. Reload the workspace.");
        return api.changeRoomReadiness({roomId,idempotencyKey:intent.key,readinessChangeRequest:{state,expectedVersion:intent.expectedVersion!,reason:explanation}});
      },(result,intent)=>{
        const saved=readinessSchema.parse(result.readiness);
        const event=readinessEventSchema.parse(result.readinessEvent);
        if(result.resourceId!==roomId || saved.roomId!==roomId || saved.state!==state || saved.version!==intent.expectedVersion!+1 || !saved.changedAt
          || event.actorId!==actorId || event.operationKey!==intent.key || event.version!==saved.version || event.state!==state
          || event.reason!==(explanation??null) || event.reservationId!==null || event.occurredAt.getTime()!==saved.changedAt.getTime())
          throw new Error("The saved readiness change could not be confirmed. Check the previous save.");
        return saved;
      },recoveryOnly);
  },
});
