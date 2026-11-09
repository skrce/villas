export const scopedPath = (path: string, businessId = "villa-rosa") => `/businesses/${businessId}${path.startsWith("/") ? path : `/${path}`}`;

export function sessionFixture<T extends { staff: { id: string; email: string }; propertyId: string; propertyName?: string; permissions: string[] }>(body: T) {
  return {
    ...body,
    identity: { id: `identity-${body.staff.id}`, email: body.staff.email },
    memberships: [{ businessId: body.propertyId, businessName: body.propertyName ?? "Villa Rosa", staff: body.staff, permissions: body.permissions }],
  };
}
