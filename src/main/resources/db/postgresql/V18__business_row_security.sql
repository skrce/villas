CREATE FUNCTION public.villas_identity_matches(provider_issuer TEXT, provider_subject TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
    SELECT (
        provider_issuer=NULLIF(current_setting('villas.login_issuer',true),'')
        AND provider_subject=NULLIF(current_setting('villas.login_subject',true),'')
        AND NULLIF(current_setting('villas.login_email',true),'') IS NOT NULL
    ) OR EXISTS (
        SELECT 1 FROM public.staff_identities p
        WHERE p.id=NULLIF(current_setting('villas.person_id',true),'')
          AND p.security_version::TEXT=NULLIF(current_setting('villas.person_version',true),'')
          AND p.issuer=provider_issuer AND p.subject=provider_subject
    );
$$;

CREATE FUNCTION public.villas_has_business(business TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
    SELECT business=NULLIF(current_setting('villas.business_id',true),'') AND (
        NULLIF(current_setting('villas.admitted',true),'')=concat_ws('/',pg_current_xact_id_if_assigned()::TEXT,
            business,current_setting('villas.person_id',true),current_setting('villas.person_version',true),
            current_setting('villas.member_id',true),current_setting('villas.member_version',true))
        OR EXISTS (
        SELECT 1 FROM public.staff_accounts s
        JOIN public.staff_identities p ON p.issuer=s.issuer AND p.subject=s.subject
        JOIN public.businesses b ON b.id=s.property_id
        WHERE s.property_id=business AND s.id=NULLIF(current_setting('villas.member_id',true),'')
          AND s.security_version::TEXT=NULLIF(current_setting('villas.member_version',true),'')
          AND p.id=NULLIF(current_setting('villas.person_id',true),'')
          AND p.security_version::TEXT=NULLIF(current_setting('villas.person_version',true),'')
          AND s.active AND b.active AND s.role='OWNER'
    ));
$$;

CREATE FUNCTION public.villas_identity_business(business TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.staff_accounts s JOIN public.businesses b ON b.id=s.property_id
        WHERE s.property_id=business AND s.active AND b.active
          AND public.villas_identity_matches(s.issuer,s.subject)
    );
$$;

CREATE FUNCTION public.villas_admission_business(business TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
    SELECT NULLIF(current_setting('villas.login_issuer',true),'') IS NOT NULL
       AND NULLIF(current_setting('villas.login_subject',true),'') IS NOT NULL
       AND NULLIF(current_setting('villas.login_email',true),'') IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id=business AND b.active)
       AND (
           EXISTS (SELECT 1 FROM public.staff_accounts s WHERE s.property_id=business
               AND s.issuer=current_setting('villas.login_issuer',true)
               AND s.subject=current_setting('villas.login_subject',true) AND s.active)
           OR EXISTS (SELECT 1 FROM public.staff_invitations i WHERE i.property_id=business
               AND i.email=current_setting('villas.login_email',true)
               AND i.state='PENDING' AND i.expires_at>CURRENT_TIMESTAMP)
       );
$$;

REVOKE ALL ON FUNCTION public.villas_identity_matches(TEXT,TEXT), public.villas_has_business(TEXT),
    public.villas_identity_business(TEXT), public.villas_admission_business(TEXT) FROM PUBLIC;

DO $$
DECLARE tenant_table TEXT;
BEGIN
    FOREACH tenant_table IN ARRAY ARRAY[
        'apartments','customers','reservations','maintenance_blocks',
        'inventory_operations','inventory_events','staff_property_lock',
        'staff_accounts','staff_invitations','staff_events','business_events',
        'seasonal_rates','booking_quotes','reservation_prices','room_readiness',
        'readiness_events','ledger_entries','reservation_allocations','recovery_events',
        'property_identity','business_onboarding'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN property_id DROP DEFAULT',tenant_table);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tenant_table);
        EXECUTE format('CREATE POLICY business_scope ON public.%I USING (public.villas_has_business(property_id)) WITH CHECK (public.villas_has_business(property_id))',tenant_table);
    END LOOP;
END $$;

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_scope ON businesses USING (public.villas_has_business(id))
    WITH CHECK (public.villas_has_business(id));
CREATE POLICY own_business_metadata ON businesses FOR SELECT
    USING (NULLIF(current_setting('villas.business_id',true),'') IS NULL
        AND (public.villas_identity_business(id) OR public.villas_admission_business(id)));

ALTER TABLE staff_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_identity ON staff_identities USING (
    id=NULLIF(current_setting('villas.person_id',true),'')
    OR (issuer=NULLIF(current_setting('villas.login_issuer',true),'')
        AND subject=NULLIF(current_setting('villas.login_subject',true),''))
) WITH CHECK (
    issuer=NULLIF(current_setting('villas.login_issuer',true),'')
    AND subject=NULLIF(current_setting('villas.login_subject',true),'')
    AND email=NULLIF(current_setting('villas.login_email',true),'')
);

CREATE POLICY own_membership_metadata ON staff_accounts FOR SELECT USING (
    NULLIF(current_setting('villas.business_id',true),'') IS NULL
    AND (public.villas_identity_matches(issuer,subject)
        OR (email=NULLIF(current_setting('villas.login_email',true),'')
            AND public.villas_admission_business(property_id)))
);
CREATE POLICY admit_membership ON staff_accounts FOR INSERT WITH CHECK (
    issuer=NULLIF(current_setting('villas.login_issuer',true),'')
    AND subject=NULLIF(current_setting('villas.login_subject',true),'')
    AND email=NULLIF(current_setting('villas.login_email',true),'')
    AND public.villas_admission_business(property_id)
);
CREATE POLICY refresh_membership ON staff_accounts FOR UPDATE USING (
    issuer=NULLIF(current_setting('villas.login_issuer',true),'')
    AND subject=NULLIF(current_setting('villas.login_subject',true),'')
    AND public.villas_admission_business(property_id)
) WITH CHECK (
    issuer=NULLIF(current_setting('villas.login_issuer',true),'')
    AND subject=NULLIF(current_setting('villas.login_subject',true),'')
    AND email=NULLIF(current_setting('villas.login_email',true),'')
    AND public.villas_admission_business(property_id)
);

CREATE POLICY admission_coordination ON staff_property_lock USING (
    public.villas_admission_business(property_id)
    OR EXISTS (SELECT 1 FROM staff_accounts s WHERE s.property_id=staff_property_lock.property_id
        AND s.issuer=NULLIF(current_setting('villas.login_issuer',true),'')
        AND s.subject=NULLIF(current_setting('villas.login_subject',true),''))
) WITH CHECK (
    public.villas_admission_business(property_id)
    OR EXISTS (SELECT 1 FROM staff_accounts s WHERE s.property_id=staff_property_lock.property_id
        AND s.issuer=NULLIF(current_setting('villas.login_issuer',true),'')
        AND s.subject=NULLIF(current_setting('villas.login_subject',true),''))
);
CREATE POLICY admission_invitation_read ON staff_invitations FOR SELECT USING (
    email=NULLIF(current_setting('villas.login_email',true),'')
    AND public.villas_admission_business(property_id)
);
CREATE POLICY admission_invitation_accept ON staff_invitations FOR UPDATE USING (
    email=NULLIF(current_setting('villas.login_email',true),'')
    AND public.villas_admission_business(property_id)
) WITH CHECK (
    email=NULLIF(current_setting('villas.login_email',true),'') AND state='ACCEPTED'
    AND EXISTS (SELECT 1 FROM staff_accounts s WHERE s.id=accepted_by
        AND s.property_id=staff_invitations.property_id AND public.villas_identity_matches(s.issuer,s.subject))
);
CREATE POLICY admission_audit ON staff_events USING (
    kind IN ('INVITATION_ACCEPTED','STAFF_EMAIL_CHANGED')
    AND public.villas_admission_business(property_id)
    AND EXISTS (SELECT 1 FROM staff_accounts s WHERE s.id=actor_id
        AND s.property_id=staff_events.property_id AND public.villas_identity_matches(s.issuer,s.subject))
);

CREATE POLICY admission_business_lock ON businesses FOR UPDATE
    USING (NULLIF(current_setting('villas.business_id',true),'') IS NULL
        AND (public.villas_admission_business(id) OR public.villas_identity_business(id)))
    WITH CHECK (NULLIF(current_setting('villas.business_id',true),'') IS NULL
        AND (public.villas_admission_business(id) OR public.villas_identity_business(id)));

DO $$
DECLARE actor_table TEXT;
BEGIN
    FOREACH actor_table IN ARRAY ARRAY['inventory_operations','inventory_events','staff_events','business_events',
        'booking_quotes','reservation_prices','readiness_events','ledger_entries'] LOOP
        EXECUTE format('ALTER POLICY business_scope ON public.%I WITH CHECK (public.villas_has_business(property_id) AND actor_id=NULLIF(current_setting(''villas.member_id'',true),''''))',actor_table);
    END LOOP;
END $$;
