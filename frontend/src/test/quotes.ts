export const TEST_QUOTE_ID="11111111-1111-4111-8111-111111111111";
export function testQuote(input:{roomId:number;startDate:string;endDate:string;guestCount?:number},id=TEST_QUOTE_ID,nightly=5001,version=1) {
  const nights=(Date.parse(`${input.endDate}T00:00:00Z`)-Date.parse(`${input.startDate}T00:00:00Z`))/86400000;
  const total=Number(BigInt(nightly)*BigInt(nights));
  return {id,roomId:input.roomId,startDate:input.startDate,endDate:input.endDate,guestCount:input.guestCount??1,
    createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+900_000).toISOString(),price:{currency:"EUR",rateVersion:version,nights,
      lines:[{startDate:input.startDate,endDate:input.endDate,name:"Base rate",nightlyCents:nightly,nights,subtotalCents:total}],totalCents:total}};
}
