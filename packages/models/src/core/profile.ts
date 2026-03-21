import { podTable, string, id } from "@undefineds.co/drizzle-solid";
import { UDFS, VCARD, FOAF, LDP } from "./namespaces.js";

export const solidProfileTable = podTable("profile", {
  id: id('id'),
  name: string("name").predicate(VCARD.fn),
  nick: string("nick").predicate(FOAF.nick),
  avatar: string("avatar").predicate(VCARD.hasPhoto),
  note: string("note").predicate(VCARD.note),
  email: string("email").predicate(VCARD.hasEmail),
  phone: string("phone").predicate(VCARD.hasTelephone),
  region: string("region").predicate(VCARD.region),
  gender: string("gender").predicate(VCARD.hasGender),
  favorite: string("favorite").predicate(UDFS.favorite),
  inbox: string("inbox").predicate(LDP.inbox)
}, {
  base: "idp:///profile/card",
  type: FOAF.Person,
  namespace: UDFS,
});

export type SolidProfileRow = typeof solidProfileTable.$inferSelect;
export type SolidProfileInsert = typeof solidProfileTable.$inferInsert;
export type SolidProfileUpdate = typeof solidProfileTable.$inferUpdate;