revoke all on function care_private.journey_integration_write(text,jsonb,uuid,uuid,boolean),care_private.journey_guest_source() from public,anon,authenticated;
revoke all on function public.care_journey_direct(jsonb,uuid) from public,anon;
grant execute on function public.care_journey_direct(jsonb,uuid) to authenticated;
revoke all on function care_private.journey_first_visit(uuid),care_private.journey_membership_sunday() from public,anon,authenticated;
revoke all on function care_private.journey_has_previous_visit(uuid,date) from public,anon,authenticated;
commit;
