import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useWorkspace } from "../../app/context";
import { eventLabel } from "../../shared/format";
import { inviteSchema } from "../../shared/schemas";
import { useDraft } from "../../shared/useDraft";
import { useSave } from "../../shared/useSave";
import type { InvitationView, StaffView } from "../../api/generated";
import {
  Dialog,
  Empty,
  Field,
  Notice,
  PageHead,
  Pending,
  QueryError,
  Status,
  Table,
} from "../../shared/ui";
export function Staff() {
  const { apis, ownerId } = useWorkspace();
  const [saved, setSaved] = useState(false);
  const [target, setTarget] = useState<{
    kind: "deactivate" | "sessions" | "invitation";
    id: string;
    version: number;
    label: string;
  }>();
  const accounts = useQuery({
    queryKey: ["staff"],
    queryFn: ({ signal }) => apis.staffApi.listStaff({ signal }),
  });
  const invitations = useQuery({
    queryKey: ["invitations"],
    queryFn: ({ signal }) => apis.staffApi.listStaffInvitations({ signal }),
  });
  const draft = useDraft("owner-invite", { email: "" });
  const form = useForm<z.infer<typeof inviteSchema>>({
    defaultValues: draft.initial,
    resolver: zodResolver(inviteSchema),
  });
  useEffect(() => {
    return form.subscribe({
      formState: { values: true },
      callback: ({ values }) => draft.save(values),
    });
  }, [form, draft]);
  const invite = useSave<{ email: string }>(
    (value) => apis.staffApi.inviteOwner({ inviteOwnerRequest: value }),
    () => {
      draft.clear();
      form.reset({ email: "" });
      setSaved(true);
    },
  );
  const change = useSave<void>(
    async () => {
      if (!target) return;
      if (target.kind === "invitation")
        return apis.staffApi.revokeStaffInvitation({
          invitationId: target.id,
          staffVersionRequest: { expectedVersion: target.version },
        });
      if (target.kind === "sessions")
        return apis.staffApi.revokeStaffSessions({
          staffId: target.id,
          staffVersionRequest: { expectedVersion: target.version },
        });
      return apis.staffApi.deactivateStaff({
        staffId: target.id,
        staffVersionRequest: { expectedVersion: target.version },
      });
    },
    () => {
      setTarget(undefined);
    },
  );
  const staffTarget = (kind: "sessions" | "deactivate", account: StaffView) =>
    setTarget({
      kind,
      id: account.id!,
      version: account.version!,
      label: account.email!,
    });
  const inviteTarget = (invite: InvitationView) =>
    setTarget({
      kind: "invitation",
      id: invite.id!,
      version: invite.version!,
      label: invite.email!,
    });
  return (
    <>
      <PageHead title="Owner settings">
        Manage who can access your property. Every invited account has full
        Owner access.
      </PageHead>
      <section className="panel">
        <h2>Invite an Owner</h2>
        <p>
          Use their exact Google account email. An invitation lasts three days.
          Let them know to sign in to Villas; no email is sent automatically.
        </p>
        <form
          className="form-row"
          noValidate
          aria-label="Invite Owner"
          onSubmit={form.handleSubmit(invite.submit)}
        >
          <Field
            label="Google account email"
            type="email"
            autoComplete="off"
            {...form.register("email")}
            error={form.formState.errors.email?.message}
          />
          <button className="button" disabled={invite.isPending}>
            {invite.isPending ? "Inviting…" : "Create invitation"}
          </button>
        </form>
        {saved && (
          <Notice>
            Invitation saved. The invited person can now sign in with Google.
          </Notice>
        )}
        {invite.message && (
          <Notice error>
            {invite.message} Check the pending invitations before retrying.
          </Notice>
        )}
      </section>
      <section className="panel">
        <h2>Owners</h2>
        {accounts.isPending ? (
          <Pending />
        ) : accounts.isError ? (
          <QueryError retry={() => void accounts.refetch()} />
        ) : (
          <Table
            label="Owners"
            headings={["Account", "Role", "Access", "Actions"]}
          >
            {accounts.data.map((account) => (
              <tr key={account.id}>
                <td>
                  <strong>{account.email}</strong>
                  {account.id === ownerId && (
                    <span className="subline">You</span>
                  )}
                </td>
                <td>Owner</td>
                <td>{account.active ? "Active" : "Deactivated"}</td>
                <td className="table-actions">
                  {account.active && (
                    <>
                      <button
                        className="text-button"
                        onClick={() => {
                          change.resetStatus();
                          staffTarget("sessions", account);
                        }}
                      >
                        Revoke sessions
                        <span className="sr-only"> for {account.email}</span>
                      </button>
                      <button
                        className="text-button danger-text"
                        onClick={() => {
                          change.resetStatus();
                          staffTarget("deactivate", account);
                        }}
                      >
                        Deactivate
                        <span className="sr-only"> {account.email}</span>
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
        <p className="hint">
          At least one active Owner must remain. Revoking your own sessions will
          sign you out.
        </p>
      </section>
      <section className="panel">
        <h2>Pending invitations</h2>
        {invitations.isPending ? (
          <Pending />
        ) : invitations.isError ? (
          <QueryError retry={() => void invitations.refetch()} />
        ) : !invitations.data.length ? (
          <Empty title="No pending invitations" />
        ) : (
          <Table
            label="Pending invitations"
            headings={["Google account", "Expires", "Status", ""]}
          >
            {invitations.data.map((item) => (
              <tr key={item.id}>
                <td>{item.email}</td>
                <td>{eventLabel(item.expiresAt)}</td>
                <td>
                  <Status value={item.state} />
                </td>
                <td>
                  <button
                    className="text-button danger-text"
                    onClick={() => {
                      change.resetStatus();
                      inviteTarget(item);
                    }}
                  >
                    Revoke invitation
                    <span className="sr-only"> for {item.email}</span>
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>
      {target && (
        <Dialog
          title={
            target.kind === "deactivate"
              ? "Deactivate Owner?"
              : target.kind === "sessions"
                ? "Revoke sessions?"
                : "Revoke invitation?"
          }
          busy={change.isPending}
          onClose={() => setTarget(undefined)}
        >
          <p>{target.label}</p>
          <p>
            {target.kind === "deactivate"
              ? "This account loses access immediately and needs a new invitation to return."
              : target.kind === "sessions"
                ? "All existing sessions lose access immediately. This Owner can sign in again through Google."
                : "This unclaimed invitation can no longer be accepted."}
          </p>
          {change.message && <Notice error>{change.message}</Notice>}
          <div className="dialog-actions">
            <button
              className="button danger"
              disabled={change.isPending || change.stale}
              onClick={() => void change.submit(undefined)}
            >
              {change.isPending ? "Saving…" : "Confirm"}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
