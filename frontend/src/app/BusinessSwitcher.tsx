import { selectBusiness, useStaffSession } from "../api/session";

export function BusinessSwitcher() {
  const session = useStaffSession();
  if (session.status !== "authenticated") return null;
  return (
    <div className="business-context">
      {session.memberships.length > 1 ? (
        <label>
          <span>Business</span>
          <select
            value={session.propertyId}
            onChange={(event) => selectBusiness(event.target.value)}
          >
            {session.memberships.map((membership) => (
              <option key={membership.businessId} value={membership.businessId}>
                {membership.businessName}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span aria-label="Current business">{session.propertyName}</span>
      )}
    </div>
  );
}
