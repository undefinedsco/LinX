import { podTable, string, id } from "drizzle-solid";
import { LINQ, VCARD, FOAF, LDP } from "./namespaces";

export const solidProfileTable = podTable("profile", {
  id: id('id'),
  name: string("name").predicate(VCARD.fn),
  nick: string("nick").predicate(FOAF.nick),
  avatar: string("avatar").predicate(VCARD.hasPhoto),
  note: string("note").predicate(VCARD.note),
  region: string("region").predicate(VCARD.region),
  gender: string("gender").predicate(VCARD.hasGender),
  favorite: string("favorite").predicate(LINQ.favorite),
  inbox: string("inbox").predicate(LDP.inbox)
}, {
  base: "idp:///profile/card",
  type: FOAF.Person,
  namespace: LINQ,
});

export type SolidProfileRow = typeof solidProfileTable.$inferSelect;
export type SolidProfileInsert = typeof solidProfileTable.$inferInsert;
export type SolidProfileUpdate = typeof solidProfileTable.$inferUpdate;